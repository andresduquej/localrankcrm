import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getConnectionByOrg } from "./connection";
import { sendTelegramMessage } from "./client";
import { escapeHtml } from "./notify";

/**
 * Tareas del mayordomo: crea, lista y completa tareas del CRM desde Telegram
 * (/tarea, /pendientes, /listo) y molesta (nag) cuando hay vencidas.
 */

export type TaskPriority = "high" | "medium" | "low";

// Palabra de prioridad dentro del texto libre ("llamar a Juan urgente").
const PRIORITY_RE = /\b(urgente|alta|media|baja)\b/i;

// Duración: "15 min", "30min", "1h", "2 horas", "45m".
const DURATION_RE = /\b(\d{1,3})\s*(h(?:oras?)?|m(?:in(?:utos?)?)?)\b/i;

/** Minutos de un token tipo "45m" / "1h" / "2 horas"; null si no hay. */
export function parseDurationMin(raw: string): number | null {
  const m = raw.match(DURATION_RE);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return m[2]!.toLowerCase().startsWith("h") ? n * 60 : n;
}

/**
 * Extrae prioridad, duración y título del texto de una tarea. Los tokens
 * reconocidos se retiran del título; el resto queda como título limpio.
 */
export function parseTaskText(raw: string): {
  title: string;
  priority: TaskPriority;
  durationMin: number | null;
} {
  let text = raw.trim();

  const durationMin = parseDurationMin(text);
  if (durationMin !== null) {
    text = text.replace(DURATION_RE, " ");
  }

  let priority: TaskPriority = "medium";
  const pm = text.match(PRIORITY_RE);
  if (pm) {
    const w = pm[1]!.toLowerCase();
    if (w === "urgente" || w === "alta") priority = "high";
    else if (w === "baja") priority = "low";
    text = text.replace(PRIORITY_RE, " ");
  }

  // Limpia comas sueltas que quedan al retirar tokens del medio.
  const title = text
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/^(?:,\s*)+|(?:,\s*)+$/g, "")
    .trim();

  return { title: title || "Tarea", priority, durationMin };
}

/** Etiqueta legible de prioridad para las respuestas del bot. */
export function priorityLabel(priority: string): string {
  if (priority === "high") return "🔥 Alta";
  if (priority === "low") return "🌿 Baja";
  return "⚡ Media";
}

export async function createTask(params: {
  organizationId: string;
  title: string;
  priority?: TaskPriority;
  durationMin?: number | null;
  dueDate?: Date | null;
}) {
  const db = getDb();
  const rows = await db
    .insert(schema.crmTask)
    .values({
      id: newId("crmTask"),
      organizationId: params.organizationId,
      title: params.title,
      priority: params.priority ?? "medium",
      durationMin: params.durationMin ?? null,
      dueDate: params.dueDate ? params.dueDate.toISOString() : "",
      status: "pending",
      done: false,
      category: "telegram",
    })
    .returning();
  return rows[0]!;
}

/** Pendientes de la org: con fecha primero (asc), las sin fecha ("") al final. */
export async function listPendingTasks(organizationId: string, limit = 10) {
  const db = getDb();
  return db
    .select()
    .from(schema.crmTask)
    .where(
      and(
        eq(schema.crmTask.organizationId, organizationId),
        eq(schema.crmTask.done, false)
      )
    )
    .orderBy(
      asc(sql`case when ${schema.crmTask.dueDate} = '' then 1 else 0 end`),
      asc(schema.crmTask.dueDate)
    )
    .limit(limit);
}

export async function countPendingTasks(organizationId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.crmTask)
    .where(
      and(
        eq(schema.crmTask.organizationId, organizationId),
        eq(schema.crmTask.done, false)
      )
    );
  return rows[0]?.n ?? 0;
}

/** Marca hecha la primera pendiente cuyo título contenga `needle`. */
export async function completeTaskByTitle(
  organizationId: string,
  needle: string
) {
  const db = getDb();
  const needleNorm = needle.toLowerCase().trim();
  const pending = await listPendingTasks(organizationId, 50);
  const hit = pending.find((t) => t.title.toLowerCase().includes(needleNorm));
  if (!hit) return null;
  const rows = await db
    .update(schema.crmTask)
    .set({ done: true, status: "done", updatedAt: new Date() })
    .where(eq(schema.crmTask.id, hit.id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Tras crear una tarea sin duración el bot pregunta "¿cuánto le dedicás?":
 * la respuesta numérica se aplica a la tarea más reciente de los últimos
 * 10 min que aún no tenga duración (evita pisar tareas viejas).
 */
export async function setDurationIfAwaiting(organizationId: string, minutes: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.crmTask)
    .where(
      and(
        eq(schema.crmTask.organizationId, organizationId),
        eq(schema.crmTask.done, false),
        isNull(schema.crmTask.durationMin),
        gt(schema.crmTask.createdAt, new Date(Date.now() - 10 * 60_000))
      )
    )
    .orderBy(desc(schema.crmTask.createdAt))
    .limit(1);
  const task = rows[0];
  if (!task) return null;
  const updated = await db
    .update(schema.crmTask)
    .set({ durationMin: minutes, updatedAt: new Date() })
    .where(eq(schema.crmTask.id, task.id))
    .returning();
  return updated[0] ?? null;
}

/** Tono del nag según las horas de atraso; "X" se sustituye por el título escapado. */
export function nagTone(hoursOverdue: number): string {
  if (hoursOverdue < 2) return "😐 ¿Ya hiciste: X?";
  if (hoursOverdue < 6) return "😠 X sigue pendiente. 30 min. YA.";
  return `🤬 X. LLEVAS ${Math.floor(hoursOverdue)} HORAS. HAZLA.`;
}

const NAG_MAX = 3;
const NAG_EVERY_MS = 2 * 3600_000;

/**
 * Molesta las tareas vencidas: dueDate en el pasado y sin nag hace <2h.
 * Máx 3 por vez en UN solo mensaje agrupado; devuelve cuántas notificó.
 */
export async function nagOverdueTasks(organizationId: string): Promise<number> {
  const db = getDb();
  const pending = await listPendingTasks(organizationId, 50);
  const now = Date.now();
  const overdue = pending
    .filter((t) => {
      const due = new Date(t.dueDate).getTime();
      if (Number.isNaN(due) || due >= now) return false;
      return !t.naggedAt || now - t.naggedAt.getTime() > NAG_EVERY_MS;
    })
    .slice(0, NAG_MAX);
  if (overdue.length === 0) return 0;

  const conn = await getConnectionByOrg(organizationId);
  if (!conn?.chatId) return 0;

  const body = overdue
    .map((t) => {
      const hours = (now - new Date(t.dueDate).getTime()) / 3600_000;
      return nagTone(Math.max(0, hours)).replace("X", escapeHtml(t.title));
    })
    .join("\n");
  const res = await sendTelegramMessage(conn.token, conn.chatId, body);
  if (!res.ok) return 0;

  for (const t of overdue) {
    await db
      .update(schema.crmTask)
      .set({ naggedAt: new Date() })
      .where(eq(schema.crmTask.id, t.id));
  }
  return overdue.length;
}
