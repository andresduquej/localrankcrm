import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import {
  deleteConnection,
  getConnectionByOrg,
  saveConnection,
  tokenLast4,
} from "@/server/telegram/connection";
import { sendTelegramMessage } from "@/server/telegram/client";
import { sendDueReminders } from "@/server/telegram/notify";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const conn = await getConnectionByOrg(session.organizationId);
  // Al abrir los ajustes aprovechamos para disparar recordatorios pendientes.
  await sendDueReminders(session.organizationId).catch(() => 0);
  if (!conn) return Response.json({ connection: null });
  return Response.json({
    connection: {
      botUsername: conn.botUsername,
      tokenLast4: tokenLast4(conn),
      chatLinked: Boolean(conn.chatId),
      chatName: conn.chatName,
    },
  });
});

const putSchema = z.object({
  token: z.string().trim().min(20).max(300),
});

/** Guarda el token: valida contra Telegram (getMe) y registra el webhook. */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const env = getEnv();
  const saved = await saveConnection({
    organizationId: session.organizationId,
    token: body.data.token,
    appBaseUrl: env.APP_BASE_URL,
  });
  if (!saved.ok) {
    return apiError(422, saved.code, saved.message);
  }
  return Response.json({ ok: true, botUsername: saved.botUsername });
});

const postSchema = z.object({
  action: z.enum(["test", "check"]),
});

/** test: mensaje de prueba al chat vinculado · check: revisa recordatorios. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const conn = await getConnectionByOrg(session.organizationId);
  if (!conn) {
    return apiError(422, "not_connected", "Primero guarda el token del bot.");
  }

  if (body.data.action === "check") {
    const sent = await sendDueReminders(session.organizationId);
    return Response.json({ ok: true, sent });
  }

  if (!conn.chatId) {
    return apiError(
      422,
      "chat_not_linked",
      "El bot aún no tiene chat vinculado: ábrelo en Telegram y mándale /start."
    );
  }
  const res = await sendTelegramMessage(
    conn.token,
    conn.chatId,
    "✅ <b>Prueba del CRM:</b> la conexión con Telegram funciona."
  );
  if (!res.ok) return apiError(502, res.code, res.message);
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session) => {
  await deleteConnection(session.organizationId);
  return Response.json({ ok: true });
});
