import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { checkRateLimitDb } from "@/lib/rate-limit-db";
import { sendTelegramMessage } from "@/server/telegram/client";
import { getConnectionByOrg } from "@/server/telegram/connection";
import { formatBogota } from "@/server/telegram/parse-when";
import {
  escapeHtml,
  formatAppointmentList,
  listToday,
  sendDueReminders,
} from "@/server/telegram/notify";
import {
  countPendingTasks,
  listPendingTasks,
  nagOverdueTasks,
} from "@/server/telegram/tasks";
import { sendPushToOrg } from "@/server/push/send";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders — recordatorios (cita en <1h) + fastidio de tareas
 * vencidas + (con ?digest=1) resumen matutino, por Telegram y por push.
 *
 * Dos formas de autenticación:
 * 1. CRON_SECRET (Authorization: Bearer ...) — procesa TODAS las orgs. Es el
 *    que usa el cron nativo de Vercel (9am Colombia).
 * 2. ?org=<webhookSecret de la telegram_connection> — procesa SOLO esa org.
 *    Es la ruta para el ping externo cada hora (cron-job.org): el secreto ya
 *    es material privado del dueño y el acceso va rate-limitado.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantDigest = url.searchParams.get("digest") === "1";
  const orgSecret = url.searchParams.get("org");

  // Ruta ping externo: una sola org, identificada por su webhookSecret.
  if (orgSecret) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!(await checkRateLimitDb(`cron-ping:${ip}`, { windowMs: 60_000, max: 5 })).allowed) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    const db = getDb();
    const rows = await db
      .select({ organizationId: schema.telegramConnection.organizationId })
      .from(schema.telegramConnection)
      .where(eq(schema.telegramConnection.webhookSecret, orgSecret))
      .limit(1);
    if (!rows[0]) {
      return Response.json({ error: "org desconocida" }, { status: 404 });
    }
    const res = await processOrg(rows[0].organizationId, wantDigest);
    return Response.json({ ok: true, single: true, ...res });
  }

  // Ruta cron nativo: todas las orgs con CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sin CRON_SECRET configurado el endpoint queda cerrado.
    return Response.json({ error: "cron deshabilitado" }, { status: 403 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const db = getDb();
  const conns = await db
    .select({ organizationId: schema.telegramConnection.organizationId })
    .from(schema.telegramConnection);

  let sent = 0;
  let nags = 0;
  let digests = 0;
  let pushes = 0;
  for (const c of conns) {
    const r = await processOrg(c.organizationId, wantDigest).catch(() => ({
      sent: 0,
      nags: 0,
      digests: 0,
      pushes: 0,
    }));
    sent += r.sent;
    nags += r.nags;
    digests += r.digests;
    pushes += r.pushes;
  }
  return Response.json({
    ok: true,
    orgs: conns.length,
    sent,
    nags,
    digests,
    pushes,
  });
}

/**
 * Ejecuta recordatorios + fastidio + (opcional) digest para una org, por
 * Telegram y por push. Todas las llamadas fallan silenciosamente: el cron no
 * debe morir por un canal caído.
 */
async function processOrg(
  organizationId: string,
  wantDigest: boolean
): Promise<{ sent: number; nags: number; digests: number; pushes: number }> {
  let sent = 0;
  let nags = 0;
  let digests = 0;
  let pushes = 0;
  const today = bogotaToday();

  // Recordatorios de citas en la próxima hora (Telegram + push del primero).
  sent += await sendDueReminders(organizationId).catch(() => 0);
  if (sent > 0) {
    const todays = await listToday(organizationId).catch(() => []);
    const proxima = todays[0];
    if (proxima) {
      pushes += await sendPushToOrg(organizationId, {
        title: "⏰ Cita próxima",
        body: `${proxima.title} — ${formatBogota(proxima.startsAt)}`,
        url: "/calendar",
      }).catch(() => 0);
    }
  }

  // Modo fastidio: tareas vencidas (Telegram) + push con el conteo.
  nags += await nagOverdueTasks(organizationId).catch(() => 0);
  if (nags > 0) {
    pushes += await sendPushToOrg(organizationId, {
      title: "🤬 Tareas vencidas",
      body: `${nags} tarea${nags > 1 ? "s" : ""} sin hacer. Sin excusas.`,
      url: "/tasks",
    }).catch(() => 0);
  }

  // Digest matutino (una vez por día, deduplicado por digestDate).
  if (wantDigest && (await digestPendiente(organizationId, today))) {
    const conn = await getConnectionByOrg(organizationId);
    const todays = await listToday(organizationId).catch(() => []);
    const pending = await listPendingTasks(organizationId, 3).catch(() => []);
    const totalTasks = await countPendingTasks(organizationId).catch(() => 0);
    if (conn?.chatId && (todays.length > 0 || totalTasks > 0)) {
      const parts: string[] = [];
      if (todays.length > 0) {
        const first = formatBogota(todays[0]!.startsAt);
        parts.push(
          `☀️ <b>Tu día de hoy (${today}):</b>\n${formatAppointmentList(todays)}\n\nPrimera cita: ${escapeHtml(todays[0]!.title)} a las ${first.split(" ").pop()}`
        );
      }
      if (totalTasks > 0) {
        const lines = pending.map((t) => {
          const fecha = t.dueDate ? formatBogota(new Date(t.dueDate)) : "sin fecha";
          return `• ${escapeHtml(t.title)} — 📅 ${fecha}`;
        });
        parts.push(`📋 <b>Tareas pendientes (${totalTasks}):</b>\n${lines.join("\n")}`);
      }
      const res = await sendTelegramMessage(conn.token, conn.chatId, parts.join("\n\n"));
      if (res.ok) digests++;
      pushes += await sendPushToOrg(organizationId, {
        title: "☀️ Tu día de hoy",
        body: `${todays.length} cita${todays.length === 1 ? "" : "s"} · ${totalTasks} tarea${totalTasks === 1 ? "" : "s"} pendiente${totalTasks === 1 ? "" : "s"}`,
        url: "/dashboard",
      }).catch(() => 0);
    }
    await marcarDigest(organizationId, today);
  }

  return { sent, nags, digests, pushes };
}

async function digestPendiente(organizationId: string, today: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ digestDate: schema.telegramConnection.digestDate })
    .from(schema.telegramConnection)
    .where(eq(schema.telegramConnection.organizationId, organizationId))
    .limit(1);
  return rows[0]?.digestDate !== today;
}

async function marcarDigest(organizationId: string, today: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.telegramConnection)
    .set({ digestDate: today })
    .where(eq(schema.telegramConnection.organizationId, organizationId));
}

/** Fecha de pared en Bogotá como YYYY-MM-DD. */
function bogotaToday(): string {
  const wall = new Date(Date.now() - 5 * 3600_000);
  return wall.toISOString().slice(0, 10);
}
