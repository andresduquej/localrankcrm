import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Configuración de IA por organización (tabla ai_settings): proveedor activo,
 * modelo, base URL y API key cifrada en reposo (AES-256-GCM, mismo esquema que
 * el token de Telegram/WhatsApp). Una fila por organización (unique en
 * organization_id). Incluye el endpoint Hermes + PIN para el agente externo
 * (guardado para planeación: hoy no hay conexión activa).
 */

/** Base URL canónica por proveedor ("custom" usa la baseUrl guardada). */
export const PRESET_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api",
  groq: "https://api.groq.com/openai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  mistral: "https://api.mistral.ai/v1",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  xai: "https://api.x.ai/v1",
  perplexity: "https://api.perplexity.ai",
  cohere: "https://api.cohere.ai/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  custom: "",
};

/** Modelo por defecto cuando la fila no guarda uno (proveedores principales). */
const DEFAULT_MODELS: Record<string, string> = {
  openrouter: "openrouter/auto",
  groq: "llama-3.3-70b-versatile",
  nvidia: "nvidia/llama-3.1-nemotron-70b",
  openai: "gpt-4o-mini",
};

/** Columnas simples (sin cifrar) que admite el patch. */
type SimpleColumns = Partial<
  Pick<
    typeof schema.aiSettings.$inferInsert,
    "provider" | "model" | "baseUrl" | "hermesEndpoint"
  >
>;

/** Columnas cifradas (cipher/iv/tag) de la API key y el PIN de Hermes. */
type SecretColumns = Partial<
  Pick<
    typeof schema.aiSettings.$inferInsert,
    | "apiKeyCipher"
    | "apiKeyIv"
    | "apiKeyTag"
    | "hermesPinCipher"
    | "hermesPinIv"
    | "hermesPinTag"
  >
>;

/** Fila descifrada de ai_settings para una organización (null si no existe). */
export type AiSettingsResolved = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  hermesEndpoint: string;
  hermesPin: string | null;
};

export async function getAiSettings(
  organizationId: string
): Promise<AiSettingsResolved | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiSettings)
    .where(eq(schema.aiSettings.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    apiKey:
      row.apiKeyCipher && row.apiKeyIv && row.apiKeyTag
        ? decryptSecret({
            cipher: row.apiKeyCipher,
            iv: row.apiKeyIv,
            tag: row.apiKeyTag,
          })
        : null,
    hermesEndpoint: row.hermesEndpoint,
    hermesPin:
      row.hermesPinCipher && row.hermesPinIv && row.hermesPinTag
        ? decryptSecret({
            cipher: row.hermesPinCipher,
            iv: row.hermesPinIv,
            tag: row.hermesPinTag,
          })
        : null,
  };
}

/**
 * Override de proveedor para el adaptador LLM (@/lib/ai): solo si la
 * organización tiene fila con API key guardada. `model` puede faltar
 * (proveedor sin default y sin modelo guardado).
 */
export type OrgProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model?: string;
};

export async function resolveProviderForOrg(
  organizationId: string
): Promise<OrgProviderConfig | null> {
  const settings = await getAiSettings(organizationId);
  if (!settings?.apiKey?.trim()) return null;

  // La base del preset gana (el catálogo evoluciona); "custom" y proveedores
  // fuera del preset usan la baseUrl guardada en la fila.
  const baseUrl =
    settings.provider === "custom"
      ? settings.baseUrl.trim()
      : (PRESET_BASE_URLS[settings.provider] ?? settings.baseUrl).trim();
  if (!baseUrl) return null; // sin base no hay llamada posible

  const model = settings.model.trim() || DEFAULT_MODELS[settings.provider];
  return model
    ? { baseUrl, apiKey: settings.apiKey, model }
    : { baseUrl, apiKey: settings.apiKey };
}

export type AiSettingsPatch = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  /** "" = borrar la key guardada · undefined = no tocar. */
  apiKey?: string;
  hermesEndpoint?: string;
  /** "" = borrar el PIN guardado · undefined = no tocar. */
  hermesPin?: string;
};

/**
 * Traduce el valor del patch a columnas de un secreto (cipher/iv/tag):
 * undefined = no tocar · "" = borrar (NULL) · texto = cifrar.
 */
function applySecret(
  secretColumns: SecretColumns,
  value: string | undefined,
  target: { cipher: keyof SecretColumns; iv: keyof SecretColumns; tag: keyof SecretColumns }
): void {
  if (value === undefined) return; // no tocar
  const trimmed = value.trim();
  if (trimmed === "") {
    secretColumns[target.cipher] = null; // borrar
    secretColumns[target.iv] = null;
    secretColumns[target.tag] = null;
    return;
  }
  const enc = encryptSecret(trimmed); // guardar cifrado
  secretColumns[target.cipher] = enc.cipher;
  secretColumns[target.iv] = enc.iv;
  secretColumns[target.tag] = enc.tag;
}

/** Upsert por organización. Los campos no incluidos en el patch se conservan. */
export async function saveAiSettings(
  organizationId: string,
  patch: AiSettingsPatch
): Promise<void> {
  // Campos simples: solo los presentes en el patch (undefined → conserva).
  const simple: SimpleColumns = {};
  if (patch.provider !== undefined) simple.provider = patch.provider.trim();
  if (patch.model !== undefined) simple.model = patch.model.trim();
  if (patch.baseUrl !== undefined) simple.baseUrl = patch.baseUrl.trim();
  if (patch.hermesEndpoint !== undefined) {
    simple.hermesEndpoint = patch.hermesEndpoint.trim();
  }

  const secretColumns: SecretColumns = {};
  applySecret(secretColumns, patch.apiKey, {
    cipher: "apiKeyCipher",
    iv: "apiKeyIv",
    tag: "apiKeyTag",
  });
  applySecret(secretColumns, patch.hermesPin, {
    cipher: "hermesPinCipher",
    iv: "hermesPinIv",
    tag: "hermesPinTag",
  });

  const db = getDb();
  await db
    .insert(schema.aiSettings)
    .values({
      id: newId("aiSettings"),
      organizationId,
      ...simple,
      ...secretColumns,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.aiSettings.organizationId,
      set: { ...simple, ...secretColumns, updatedAt: new Date() },
    });
}
