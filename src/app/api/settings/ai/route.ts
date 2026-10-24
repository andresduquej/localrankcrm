import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { rawChat } from "@/lib/ai";
import { getEnv } from "@/lib/env";
import {
  PRESET_BASE_URLS,
  getAiSettings,
  resolveProviderForOrg,
  saveAiSettings,
  type AiSettingsResolved,
} from "@/server/ai/settings";

export const dynamic = "force-dynamic";

/**
 * Ajustes de IA por organización (Ajustes → IA / APIs): proveedor activo,
 * modelo, base URL y API key cifrada, más el endpoint Hermes + PIN. Los
 * secretos NUNCA salen por la API — solo flags hasApiKey / hasPin.
 */

function serialize(org: AiSettingsResolved | null) {
  return {
    provider: org?.provider ?? null,
    model: org?.model ?? "",
    baseUrl: org?.baseUrl ?? "",
    hasApiKey: Boolean(org?.apiKey),
    hermesEndpoint: org?.hermesEndpoint ?? "",
    hasPin: Boolean(org?.hermesPin),
    presets: Object.keys(PRESET_BASE_URLS),
  };
}

export const GET = withAuth(async (session) => {
  const settings = await getAiSettings(session.organizationId);
  return Response.json(serialize(settings));
});

const putSchema = z.object({
  provider: z.string().trim().min(1).max(30).optional(),
  model: z.string().trim().max(120).optional(),
  baseUrl: z.string().trim().max(200).optional(),
  // API key: vacía ⇒ sin cambios en el cliente; el servidor distingue
  // undefined (no tocar) de "" (borrar) en saveAiSettings.
  apiKey: z.string().max(200).optional(),
  hermesEndpoint: z.string().trim().max(300).optional(),
  hermesPin: z.string().max(100).optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  await saveAiSettings(session.organizationId, body.data);
  const settings = await getAiSettings(session.organizationId);
  return Response.json(serialize(settings));
});

const postSchema = z.object({
  op: z.literal("test"),
  model: z.string().trim().max(120).optional(),
});

/**
 * Prueba de conexión contra el proveedor activo (override por organización;
 * si no hay, el entorno global con el mismo orden de fallback que
 * callProvider). Siempre responde 200 con ok:true/false para feedback inline.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  let baseUrl = "";
  let apiKey = "";
  let model = body.data.model?.trim() ?? "";

  const org = await resolveProviderForOrg(session.organizationId);
  if (org) {
    baseUrl = org.baseUrl;
    apiKey = org.apiKey;
    model = model || org.model || "";
  } else {
    // Sin config por organización: arma el override desde env (igual que
    // hace callProvider hoy: OpenRouter, si no NVIDIA/NINEROUTER/GEMINI).
    const env = getEnv();
    if (env.OPENROUTER_API_TOKEN) {
      baseUrl = env.OPENROUTER_BASE_URL;
      apiKey = env.OPENROUTER_API_TOKEN;
      model = model || env.OPENROUTER_MODEL || "openrouter/auto";
    } else if (env.NVIDIA_API_TOKEN) {
      baseUrl = "https://integrate.api.nvidia.com";
      apiKey = env.NVIDIA_API_TOKEN;
      model = model || env.NVIDIA_MODEL || "nvidia/llama-3.1-nemotron-70b";
    } else if (env.NINEROUTER_API_TOKEN) {
      baseUrl = "https://api.9router.ai/api";
      apiKey = env.NINEROUTER_API_TOKEN;
      model = model || "openrouter/auto";
    } else if (env.GEMINI_API_KEY) {
      baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
      apiKey = env.GEMINI_API_KEY;
      model = model || "gemini-2.0-flash";
    }
  }

  if (!baseUrl || !apiKey) {
    return Response.json({
      ok: false,
      detail:
        "Sin proveedor configurado: guarda una API key en Ajustes → IA / APIs o define OPENROUTER_API_TOKEN en el entorno.",
    });
  }
  if (!model) {
    return Response.json({
      ok: false,
      detail: "Sin modelo configurado: elige un modelo para el proveedor activo y guarda.",
    });
  }

  try {
    const sample = await rawChat(
      baseUrl,
      apiKey,
      model,
      [{ role: "user", content: "Responde exactamente: ok" }],
      20_000
    );
    return Response.json({ ok: true, model, sample });
  } catch (err) {
    return Response.json({
      ok: false,
      model,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
