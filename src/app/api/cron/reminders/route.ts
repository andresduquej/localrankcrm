import { getDb, schema } from "@/lib/db";
import { sendDueReminders } from "@/server/telegram/notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders — revisa recordatorios de todas las orgs con bot
 * vinculado. Protegido con CRON_SECRET (header Authorization: Bearer ...).
 *
 * En el plan hobby de Vercel los cron nativos son diarios, así que este
 * endpoint está pensado para un ping externo (p.ej. cron-job.org, gratis,
 * cada 1-5 min) y además se invoca cada vez que el usuario escribe al bot
 * o abre los ajustes de Telegram.
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

  const db = getDb();
  const conns = await db
    .select({
      organizationId: schema.telegramConnection.organizationId,
      chatId: schema.telegramConnection.chatId,
    })
    .from(schema.telegramConnection);

  let sent = 0;
  for (const c of conns) {
    if (!c.chatId) continue;
    sent += await sendDueReminders(c.organizationId).catch(() => 0);
  }
  return Response.json({ ok: true, orgs: conns.filter((c) => c.chatId).length, sent });
}
