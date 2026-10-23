import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { safeEqual } from "@/server/inbox/webhook";
import { callTelegram, type TgUser } from "./client";

/**
 * Conexión Telegram por organización: token del bot cifrado en reposo
 * (AES-256-GCM, mismo esquema que el token de WhatsApp) + secretos del
 * webhook. Una conexión por org (unique en organization_id).
 */

export type TelegramConnection = {
  id: string;
  organizationId: string;
  botUsername: string;
  token: string;
  chatId: string | null;
  chatName: string | null;
  webhookSecret: string;
  headerSecret: string;
};

type Row = typeof schema.telegramConnection.$inferSelect;

function toConnection(row: Row): TelegramConnection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    botUsername: row.botUsername,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
    chatId: row.chatId,
    chatName: row.chatName,
    webhookSecret: row.webhookSecret,
    headerSecret: row.headerSecret,
  };
}

export async function getConnectionByOrg(
  organizationId: string
): Promise<TelegramConnection | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.telegramConnection)
    .where(eq(schema.telegramConnection.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toConnection(rows[0]) : null;
}

/** Enrutado del webhook: resuelve la conexión por el secreto de la URL. */
export async function getConnectionByWebhookSecret(
  secret: string
): Promise<TelegramConnection | null> {
  if (!secret) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.telegramConnection)
    .limit(50);
  // Comparación timing-safe contra cada secreto (máx. 1 por organización).
  const row = rows.find((r) => safeEqual(secret, r.webhookSecret));
  return row ? toConnection(row) : null;
}

/** Valida el token contra Telegram y guarda/actualiza la conexión. */
export async function saveConnection(params: {
  organizationId: string;
  token: string;
  appBaseUrl: string;
}): Promise<
  | { ok: true; botUsername: string }
  | { ok: false; code: string; message: string }
> {
  const me = await callTelegram<TgUser>(params.token, "getMe");
  if (!me.ok) return { ok: false, code: me.code, message: me.message };
  const botUsername = me.result.username ?? "";

  const db = getDb();
  const existing = await getConnectionByOrg(params.organizationId);
  const webhookSecret = existing?.webhookSecret ?? randomBytes(24).toString("hex");
  const headerSecret = existing?.headerSecret ?? randomBytes(24).toString("hex");
  const cipher = encryptSecret(params.token);

  const values = {
    organizationId: params.organizationId,
    botUsername,
    tokenCipher: cipher.cipher,
    tokenIv: cipher.iv,
    tokenTag: cipher.tag,
    webhookSecret,
    headerSecret,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.telegramConnection)
      .set(values)
      .where(eq(schema.telegramConnection.id, existing.id));
  } else {
    await db.insert(schema.telegramConnection).values({
      id: newId("telegramConnection"),
      ...values,
    });
  }

  // Registrar el webhook en Telegram (mejor esfuerzo: si falla, se reintenta
  // al guardar de nuevo; sin webhook los comandos entrantes no llegan).
  const hook = await callTelegram(params.token, "setWebhook", {
    url: `${params.appBaseUrl}/api/webhooks/tg/${webhookSecret}`,
    secret_token: headerSecret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  if (!hook.ok) {
    return {
      ok: false,
      code: "webhook_setup_failed",
      message: `El token es válido pero no se pudo registrar el webhook: ${hook.message}`,
    };
  }

  return { ok: true, botUsername };
}

/** Vincula el chat que mandó /start a la organización. */
export async function linkChat(
  connectionId: string,
  chatId: string,
  chatName: string | null
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.telegramConnection)
    .set({ chatId, chatName, updatedAt: new Date() })
    .where(eq(schema.telegramConnection.id, connectionId));
}

export async function deleteConnection(organizationId: string): Promise<void> {
  const existing = await getConnectionByOrg(organizationId);
  if (!existing) return;
  await callTelegram(existing.token, "deleteWebhook", {
    drop_pending_updates: true,
  }).catch(() => null);
  const db = getDb();
  await db
    .delete(schema.telegramConnection)
    .where(eq(schema.telegramConnection.id, existing.id));
}

export function tokenLast4(connection: TelegramConnection): string {
  return connection.token.slice(-4);
}
