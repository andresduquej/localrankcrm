import { apiError } from "@/lib/api";
import { safeEqual } from "@/server/inbox/webhook";
import { getConnectionByWebhookSecret, linkChat } from "@/server/telegram/connection";
import { sendTelegramMessage } from "@/server/telegram/client";
import { formatBogota } from "@/server/telegram/parse-when";
import {
  HELP_TEXT,
  completeByTitle,
  createAppointment,
  escapeHtml,
  formatAppointmentList,
  listAppointments,
  listToday,
  sendDueReminders,
} from "@/server/telegram/notify";
import { parseWhen } from "@/server/telegram/parse-when";

export const dynamic = "force-dynamic";

/**
 * Webhook de Telegram (Bot API). Doble autenticación:
 * 1. El secreto de la URL (segmento) debe coincidir con la conexión.
 * 2. El header X-Telegram-Bot-Api-Secret-Token debe coincidir (lo fijamos
 *    en setWebhook) — evita que terceros inyecten actualizaciones falsas.
 * Solo el chat vinculado (el que mandó /start) puede ejecutar comandos.
 */

type TgUpdate = {
  message?: {
    chat: { id: number; type: string; first_name?: string };
    from?: { id: number; first_name?: string };
    text?: string;
  };
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;
  const conn = await getConnectionByWebhookSecret(secret);
  if (!conn) {
    return apiError(404, "not_found", "Webhook desconocido");
  }

  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!headerSecret || !safeEqual(headerSecret, conn.headerSecret)) {
    return apiError(401, "unauthorized", "Firma de webhook inválida");
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  const message = update?.message;
  const text = message?.text?.trim() ?? "";
  const chatId = message?.chat.id?.toString();

  // Siempre 200 a Telegram salvo auth fallido: un 4xx haría que reintente
  // indefinidamente actualizaciones que nunca van a procesarse.
  if (!message || !text || !chatId) {
    return Response.json({ ok: true });
  }

  try {
    // Chat aún sin vincular: solo aceptamos /start para reclamar la conexión.
    if (!conn.chatId) {
      if (text.startsWith("/start")) {
        await linkChat(conn.id, chatId, message.from?.first_name ?? null);
        await sendTelegramMessage(
          conn.token,
          chatId,
          `👋 ¡Listo, ${escapeHtml(message.from?.first_name ?? "")}! Este bot está vinculado a tu CRM.\n\n${HELP_TEXT}`
        );
      } else {
        await sendTelegramMessage(
          conn.token,
          chatId,
          "Este bot es privado. Manda /start para vincularlo a tu CRM."
        );
      }
      return Response.json({ ok: true });
    }

    // Chat distinto al vinculado: ignorar silenciosamente (no revelar nada).
    if (chatId !== conn.chatId) {
      return Response.json({ ok: true });
    }

    const reply = await handleCommand(conn.organizationId, text);
    if (reply) {
      await sendTelegramMessage(conn.token, chatId, reply);
    }

    // Aprovechamos cada interacción para disparar recordatorios pendientes.
    await sendDueReminders(conn.organizationId).catch(() => 0);
  } catch (err) {
    console.error("[webhook/tg] error:", err);
    // Responder 200 igualmente: Telegram reintentaría el mismo update.
  }

  return Response.json({ ok: true });
}

async function handleCommand(organizationId: string, text: string): Promise<string | null> {
  const lower = text.toLowerCase();

  if (lower.startsWith("/start")) return HELP_TEXT;
  if (lower.startsWith("/ayuda") || lower.startsWith("/help")) return HELP_TEXT;

  if (lower.startsWith("/hoy")) {
    const rows = await listToday(organizationId);
    return `📅 <b>Hoy:</b>\n${formatAppointmentList(rows)}`;
  }

  if (lower.startsWith("/lista")) {
    const rows = await listAppointments(organizationId, { limit: 10 });
    return `🗓 <b>Próximas citas:</b>\n${formatAppointmentList(rows)}`;
  }

  if (lower.startsWith("/hecho")) {
    const needle = text.slice("/hecho".length).trim();
    const done = await completeByTitle(organizationId, needle);
    if (!done) {
      return "No encontré una cita pendiente con ese texto. Usa /lista para verlas.";
    }
    return `✅ Listo: <b>${escapeHtml(done.title)}</b> (${formatBogota(done.startsAt)}) marcada como cumplida.`;
  }

  if (lower.startsWith("/cita")) {
    const rest = text.slice("/cita".length).trim();
    if (!rest) {
      return "Dime qué y cuándo. Ej: <code>/cita reunión con Juan mañana 3pm</code>";
    }
    const parsed = parseWhen(rest);
    if (!parsed) {
      return [
        "No entendí la fecha/hora 🤔",
        "Prueba con: <code>/cita reunión con Juan mañana 3pm</code>",
        "Fechas: hoy, mañana, pasado mañana, lunes…domingo, 25/12, 2026-11-03",
        "Horas: 3pm, 15:30, 10am, a las 4",
      ].join("\n");
    }
    await createAppointment({
      organizationId,
      title: parsed.title,
      startsAt: parsed.startsAt,
      source: "telegram",
    });
    return `📌 Agendado: <b>${escapeHtml(parsed.title)}</b>\n🕐 ${formatBogota(parsed.startsAt)} (hora Colombia)\n\nTe aviso ${REMINDER_HINT}.`;
  }

  // Texto libre sin comando → sugerir el formato.
  return `Solo entiendo comandos 🙂\n\n${HELP_TEXT}`;
}

const REMINDER_HINT = "una hora antes";
