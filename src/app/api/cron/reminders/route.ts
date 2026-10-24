import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
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

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders — recordatorios (cita en <1h) para todas las orgs
 * con bot vinculado. Protegido con CRON_SECRET (Authorization: Bearer ...).
 *
 * Con ?digest=1 envía además el resumen matutino de la agenda del día (una
 * vez por día, deduplicado). El cron nativo de Vercel corre a las 9am
 * Colombia (14:00 UTC); también se puede usar un ping externo más frecuente
 * sin digest para los recordatorios de la hora previa.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sin CRON_SECRET configurado el endpoint queda cerrado.
    return Response.json({ error: "cron deshabilitado" }, { status: 403 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const wantDigest = new URL(req.url).searchParams.get("digest") === "1";
  const db = getDb();
  const conns = await db
    .select({
      organizationId: schema.telegramConnection.organizationId,
      chatId: schema.telegramConnection.chatId,
      digestDate: schema.telegramConnection.digestDate,
    })
    .from(schema.telegramConnection);

  let sent = 0;
  let nags = 0;
  let digests = 0;
  const today = bogotaToday();

  for (const c of conns) {
    if (!c.chatId) continue;
    sent += await sendDueReminders(c.organizationId).catch(() => 0);
    nags += await nagOverdueTasks(c.organizationId).catch(() => 0);

    if (wantDigest && c.digestDate !== today) {
      const conn = await getConnectionByOrg(c.organizationId);
      const todays = await listToday(c.organizationId).catch(() => []);
      const pending = await listPendingTasks(c.organizationId, 3).catch(() => []);
      const totalTasks = await countPendingTasks(c.organizationId).catch(() => 0);
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
      }
      await db
        .update(schema.telegramConnection)
        .set({ digestDate: today })
        .where(eq(schema.telegramConnection.organizationId, c.organizationId));
    }
  }
  return Response.json({
    ok: true,
    orgs: conns.filter((c) => c.chatId).length,
    sent,
    nags,
    digests,
  });
}

/** Fecha de pared en Bogotá como YYYY-MM-DD. */
function bogotaToday(): string {
  const wall = new Date(Date.now() - 5 * 3600_000);
  return wall.toISOString().slice(0, 10);
}
