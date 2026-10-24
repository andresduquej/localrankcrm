import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { formatBogota } from "./parse-when";
import { getConnectionByOrg } from "./connection";
import { sendTelegramMessage } from "./client";

/**
 * Agenda + notificaciones: crea citas, lista próximas y dispara los
 * recordatorios (cita en menos de REMINDER_WINDOW_MIN minutos → aviso).
 */

const REMINDER_WINDOW_MIN = 60;

export async function createAppointment(params: {
  organizationId: string;
  title: string;
  startsAt: Date;
  notes?: string;
  source?: string;
}) {
  const db = getDb();
  const rows = await db
    .insert(schema.appointment)
    .values({
      id: newId("appointment"),
      organizationId: params.organizationId,
      title: params.title,
      startsAt: params.startsAt,
      notes: params.notes ?? "",
      source: params.source ?? "api",
    })
    .returning();
  return rows[0]!;
}

export async function listAppointments(
  organizationId: string,
  opts: { limit?: number; includeDone?: boolean } = {}
) {
  const db = getDb();
  const conditions = [
    eq(schema.appointment.organizationId, organizationId),
    gt(schema.appointment.startsAt, new Date(Date.now() - 3600_000)),
  ];
  if (!opts.includeDone) {
    conditions.push(isNull(schema.appointment.completedAt));
  }
  return db
    .select()
    .from(schema.appointment)
    .where(and(...conditions))
    .orderBy(asc(schema.appointment.startsAt))
    .limit(opts.limit ?? 10);
}

/** Marca completada la primera cita pendiente cuyo título contenga `needle`. */
export async function completeByTitle(
  organizationId: string,
  needle: string
): Promise<{ title: string; startsAt: Date } | null> {
  const db = getDb();
  const upcoming = await listAppointments(organizationId, { limit: 50 });
  const needleNorm = needle.toLowerCase().trim();
  const hit = upcoming.find((a) =>
    needleNorm === ""
      ? true
      : a.title.toLowerCase().includes(needleNorm)
  );
  if (!hit) return null;
  await db
    .update(schema.appointment)
    .set({ completedAt: new Date() })
    .where(eq(schema.appointment.id, hit.id));
  return { title: hit.title, startsAt: hit.startsAt };
}

export async function listToday(organizationId: string) {
  const db = getDb();
  const wallNow = new Date(Date.now() - 5 * 3600_000); // Bogotá
  const startWall = new Date(
    Date.UTC(wallNow.getUTCFullYear(), wallNow.getUTCMonth(), wallNow.getUTCDate())
  );
  const dayStart = new Date(startWall.getTime() + 5 * 3600_000);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return db
    .select()
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        gt(schema.appointment.startsAt, dayStart),
        lt(schema.appointment.startsAt, dayEnd),
        isNull(schema.appointment.completedAt)
      )
    )
    .orderBy(asc(schema.appointment.startsAt))
    .limit(25);
}

/**
 * Envía los recordatorios pendientes de una organización: citas que empiezan
 * en la próxima hora y aún no avisadas. Se invoca desde el webhook (cada vez
 * que el usuario escribe al bot) y desde el endpoint de cron.
 */
export async function sendDueReminders(
  organizationId: string
): Promise<number> {
  const conn = await getConnectionByOrg(organizationId);
  if (!conn?.chatId) return 0;
  const db = getDb();
  const now = Date.now();
  const due = await db
    .select()
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        isNull(schema.appointment.remindedAt),
        isNull(schema.appointment.completedAt),
        gt(schema.appointment.startsAt, new Date(now)),
        lt(schema.appointment.startsAt, new Date(now + REMINDER_WINDOW_MIN * 60_000))
      )
    )
    .orderBy(asc(schema.appointment.startsAt))
    .limit(10);

  let sent = 0;
  for (const apt of due) {
    const res = await sendTelegramMessage(
      conn.token,
      conn.chatId,
      `⏰ <b>Recordatorio:</b> ${escapeHtml(apt.title)} — ${formatBogota(apt.startsAt)}`
    );
    if (res.ok) {
      sent++;
      await db
        .update(schema.appointment)
        .set({ remindedAt: new Date() })
        .where(eq(schema.appointment.id, apt.id));
    }
  }
  return sent;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatAppointmentList(
  rows: { title: string; startsAt: Date }[]
): string {
  if (rows.length === 0) return "No tienes citas agendadas.";
  return rows.map((a) => `• ${escapeHtml(a.title)} — ${formatBogota(a.startsAt)}`).join("\n");
}

export const HELP_TEXT = [
  "🤖 <b>Comandos del asistente:</b>",
  "",
  "<code>/cita</code> &lt;qué&gt; &lt;cuándo&gt; — agenda una cita",
  "Ej: <code>/cita reunión con Juan mañana 3pm</code>",
  "Ej: <code>/cita hoy 15:30 llamada de seguimiento</code>",
  "Ej: <code>/cita jueves 10am cortar pelo</code>",
  "",
  "<code>/hoy</code> — citas de hoy",
  "<code>/lista</code> — próximas 10 citas",
  "<code>/hecho</code> &lt;texto&gt; — marca una cita como cumplida",
  "",
  "<code>/tarea</code> &lt;qué&gt; — crea una tarea. Ej: <code>/tarea llamar a Juan urgente mañana 15 min</code>",
  "<code>/pendientes</code> — lista las tareas pendientes",
  "<code>/listo</code> &lt;texto&gt; — marca una tarea hecha. Ej: <code>/listo llamar a juan</code>",
  "",
  "<code>/ayuda</code> — esta ayuda",
].join("\n");
