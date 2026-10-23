/**
 * Cliente mínimo de la Bot API de Telegram.
 * Puro (sin BD): cada función recibe el token del bot.
 */

export type TgResult<T> =
  | { ok: true; result: T }
  | { ok: false; code: string; message: string };

export async function callTelegram<T>(
  token: string,
  method: string,
  payload: Record<string, unknown> = {}
): Promise<TgResult<T>> {
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    return {
      ok: false,
      code: "telegram_unreachable",
      message: `No se pudo conectar con Telegram: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string }
    | null;
  if (!res.ok || !data?.ok) {
    return {
      ok: false,
      code: "telegram_error",
      message: data?.description ?? `Telegram respondió HTTP ${res.status}`,
    };
  }
  return { ok: true, result: data.result as T };
}

export type TgUser = { id: number; username?: string; first_name?: string };
export type TgChat = { id: number; type: string; first_name?: string };

export function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<TgResult<unknown>> {
  return callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}
