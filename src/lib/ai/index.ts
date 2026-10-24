import type { z } from "zod";
import { getEnv, isAiConfigured } from "@/lib/env";

/**
 * Adaptador LLM OpenRouter-compatible — ÚNICA frontera con el proveedor de IA
 * (Constitución II). Regla operativa: la salida del modelo es impredecible;
 * todo consumo pasa por extracción robusta + Zod + reintentos, y un hipo del
 * proveedor jamás propaga excepción (resultado `error` tipado).
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: "not_configured" | "provider_error" | "invalid_output"; detail: string };

/**
 * Override de proveedor por organización (config guardada en BD): gana sobre
 * el entorno global. Base URL compatible con la API de OpenAI.
 */
export type ProviderOverride = {
  baseUrl: string;
  apiKey: string;
  model?: string;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts?: { model?: string; judge?: boolean; timeoutMs?: number; provider?: ProviderOverride }
): Promise<ChatJsonResult<T>> {
  // Resolución del proveedor: el override por organización gana; si no hay,
  // se usa el entorno global (comportamiento histórico, idéntico).
  let model: string | undefined;
  if (opts?.provider) {
    model = opts.model ?? opts.provider.model;
    if (!model?.trim()) {
      return {
        ok: false,
        error: "not_configured",
        detail: "El proveedor de la organización no tiene modelo configurado",
      };
    }
  } else {
    if (!isAiConfigured()) {
      return {
        ok: false,
        error: "not_configured",
        detail: "Sin OPENROUTER_API_TOKEN configurado",
      };
    }
    const env = getEnv();
    model =
      opts?.model ??
      (opts?.judge
        ? (env.OPENROUTER_JUDGE_MODEL ?? env.OPENROUTER_MODEL)
        : env.OPENROUTER_MODEL);
    if (!model?.trim()) {
      return {
        ok: false,
        error: "not_configured",
        detail: "Sin OPENROUTER_MODEL configurado",
      };
    }
  }

  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptMessages: ChatMessage[] =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "STRICT: tu respuesta anterior no fue JSON válido según el esquema. Responde ÚNICAMENTE el objeto JSON, sin explicaciones ni markdown.",
            },
          ];
    try {
      const raw = await callProvider(model, attemptMessages, opts?.timeoutMs, opts?.provider);
      const extracted = extractJson(raw);
      if (extracted === null) {
        lastDetail = `sin JSON extraíble (raw=${truncate(raw)})`;
        continue;
      }
      const parsed = schema.safeParse(extracted);
      if (!parsed.success) {
        lastDetail = `no cumple el esquema: ${parsed.error.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; ")} (raw=${truncate(raw)})`;
        continue;
      }
      return { ok: true, data: parsed.data, raw };
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return {
    ok: false,
    error: lastDetail.includes("esquema") || lastDetail.includes("JSON")
      ? "invalid_output"
      : "provider_error",
    detail: lastDetail,
  };
}

/**
 * URL del endpoint de chat a partir de la base del proveedor. Normaliza las
 * dos convenciones habituales:
 * - base terminada en /v1 (Groq, OpenAI, DeepSeek…) → base + /chat/completions
 * - resto (OpenRouter /api, bases sin versión, Gemini /v1beta/openai…)
 *   → base + /v1/chat/completions
 */
export function buildChatUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (base.endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

async function callProvider(
  model: string,
  messages: ChatMessage[],
  timeoutMs = 60_000,
  provider?: ProviderOverride
): Promise<string> {
  let baseUrl: string;
  let token: string;

  if (provider) {
    // Override por organización: usa exactamente lo guardado, sin tocar env.
    baseUrl = provider.baseUrl;
    token = provider.apiKey;
  } else {
    const env = getEnv();

    // Determine which provider to use based on available tokens
    baseUrl = env.OPENROUTER_BASE_URL;
    token = env.OPENROUTER_API_TOKEN || "";

    // If OpenRouter not available, try other providers
    if (!token && env.NVIDIA_API_TOKEN) {
      baseUrl = "https://integrate.api.nvidia.com";
      token = env.NVIDIA_API_TOKEN;
      if (!model || model.includes("claude") || model.includes("gpt")) {
        model = env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-70b";
      }
    } else if (!token && env.NINEROUTER_API_TOKEN) {
      baseUrl = "https://api.9router.ai/api";
      token = env.NINEROUTER_API_TOKEN;
    } else if (!token && env.GEMINI_API_KEY) {
      baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
      token = env.GEMINI_API_KEY;
      if (!model || !model.includes("gemini")) {
        model = "gemini-2.0-flash";
      }
    }
  }

  if (!token) {
    throw new Error("No hay token de IA configurado");
  }

  return rawChat(baseUrl, token, model, messages, timeoutMs);
}

/** Llamada HTTP cruda al proveedor (formato OpenAI). Lanza en error/timeout. */
export async function rawChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs = 60_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(buildChatUrl(baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`proveedor respondió ${res.status}: ${truncate(text)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("respuesta del proveedor sin contenido");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracción robusta de JSON de una respuesta de modelo:
 * 1) bloque ```json ... ``` (o ``` ... ```), 2) el texto completo,
 * 3) del primer `{` al último `}`.
 */
export function extractJson(raw: string): unknown | null {
  const candidates: string[] = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  candidates.push(raw.trim());
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
