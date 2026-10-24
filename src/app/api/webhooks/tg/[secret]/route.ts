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
import {
  createTask,
  completeTaskByTitle,
  listPendingTasks,
  nagOverdueTasks,
  parseTaskText,
  priorityLabel,
  setDurationIfAwaiting,
} from "@/server/telegram/tasks";

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
    await nagOverdueTasks(conn.organizationId).catch(() => 0);
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

  if (lower.startsWith("/tarea")) {
    const rest = text.slice("/tarea".length).trim();
    if (!rest) {
      return "Dime la tarea. Ej: <code>/tarea llamar a Juan urgente mañana 15 min</code>";
    }
    const parsed = parseTaskText(rest);
    // Sin fecha reconocible no es error: la tarea queda sin fecha.
    const when = parseWhen(parsed.title);
    const title = when && when.title !== "Cita" ? when.title : parsed.title;
    const task = await createTask({
      organizationId,
      title,
      priority: parsed.priority,
      durationMin: parsed.durationMin,
      dueDate: when ? when.startsAt : null,
    });
    const bits: string[] = [];
    if (when) bits.push(`📅 ${formatBogota(when.startsAt)}`);
    bits.push(priorityLabel(task.priority));
    if (parsed.durationMin !== null) bits.push(`⏱ ${parsed.durationMin} min`);
    let reply = `📝 Tarea: <b>${escapeHtml(task.title)}</b>\n${bits.join(" · ")}`;
    if (parsed.durationMin === null) {
      reply += "\n\n¿Cuánto le dedicás? Responde <code>15</code>, <code>30</code> o <code>60</code> (minutos).";
    }
    return reply;
  }

  if (lower.startsWith("/pendientes")) {
    const rows = await listPendingTasks(organizationId, 10);
    if (rows.length === 0) {
      return "Nada pendiente. Sacaste todo de la cabeza 🧠";
    }
    const lines = rows.map((t, i) => {
      const fecha = t.dueDate ? formatBogota(new Date(t.dueDate)) : "sin fecha";
      return `${i + 1}. ${escapeHtml(t.title)} — 📅 ${fecha} · ${priorityLabel(t.priority)}`;
    });
    return `📋 <b>Pendientes:</b>\n${lines.join("\n")}`;
  }

  if (lower.startsWith("/listo")) {
    const needle = text.slice("/listo".length).trim();
    const done = await completeTaskByTitle(organizationId, needle);
    if (!done) {
      return "No encontré esa tarea pendiente. Usa /pendientes para verlas.";
    }
    return `✅ Tarea hecha: <b>${escapeHtml(done.title)}</b>`;
  }

  // Respuesta a "¿cuánto le dedicás?": un número solo, opcional con unidad.
  // Sin tarea esperando la duración cae al catch-all de abajo.
  const num = text.match(/^\d{1,3}\s*(min|minutos?|m|h|horas?)?$/i);
  if (num) {
    const n = parseInt(num[0]!, 10);
    const minutes = (num[1] ?? "").toLowerCase().startsWith("h") ? n * 60 : n;
    const task = await setDurationIfAwaiting(organizationId, minutes);
    if (task) {
      return `⏱ Anotado: ${minutes} min para «${escapeHtml(task.title)}». Te fastidio hasta que la hagas.`;
    }
  }

  // Texto libre sin comando → sugerir el formato.
  return `Solo entiendo comandos 🙂\n\n${HELP_TEXT}`;
}

const REMINDER_HINT = "una hora antes";
