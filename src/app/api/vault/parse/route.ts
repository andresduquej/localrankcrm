import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { chatJson } from "@/lib/ai";
import { resolveProviderForOrg } from "@/server/ai/settings";
import { isAiConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Entiende un texto libre (dictado o tipeo) sobre un recurso y lo traduce a
 * los campos de la bóveda: título, URL, notas ("para qué sirve") y etiquetas.
 * Sin IA configurada cae a un extractor por regex (URL + primera frase).
 */

const bodySchema = z.object({
  text: z.string().trim().min(3).max(2000),
});

const ParsedResource = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(2000).default(""),
  tags: z.array(z.string().trim().min(1).max(30)).max(6).default([]),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const text = body.data.text;

  const provider = await resolveProviderForOrg(session.organizationId);
  if (!provider && !isAiConfigured()) {
    return Response.json({ ok: true, source: "fallback", resource: extractFallback(text) });
  }

  const result = await chatJson(
    ParsedResource,
    [
      {
        role: "system",
        content:
          "Extraes recursos para la bóveda de un CRM personal a partir de texto libre en español (a menudo dictado por voz, con errores de dictado). Devuelve SOLO JSON: {\"title\": nombre corto del recurso (sin URL), \"url\": la URL completa si aparece (agrega https:// si falta el esquema; si no hay, \"\"), \"notes\": para qué sirve según el usuario (1-2 frases, corrige el dictado), \"tags\": 0-3 etiquetas cortas en minúsculas}. No inventes información que no esté en el texto.",
      },
      { role: "user", content: text },
    ],
    { provider: provider ?? undefined, timeoutMs: 20_000 }
  );

  if (result.ok) {
    return Response.json({ ok: true, source: "ai", resource: result.data });
  }
  console.error("[vault/parse] IA falló, uso fallback:", result.detail);
  return Response.json({ ok: true, source: "fallback", resource: extractFallback(text) });
});

/** Sin IA: saca la URL por regex y usa el resto como título. */
function extractFallback(text: string): z.infer<typeof ParsedResource> {
  const urlMatch = text.match(/https?:\/\/\S+|www\.\S+|(?:github\.com|figma\.com|notion\.so|vercel\.com)\/\S+/i);
  const url = urlMatch ? urlMatch[0] : "";
  const sinUrl = (url ? text.replace(url, " ") : text)
    .replace(/\s+/g, " ")
    .replace(/^(guarda|guardar|agrega|agregar|añade|anota|este|esta|esto|es|para)\s+/gi, "")
    .trim();
  return {
    title: (sinUrl.split(/[.,;]/)[0] || "Recurso").slice(0, 120),
    url: url.startsWith("http") ? url : url ? `https://${url}` : "",
    notes: text.slice(0, 500),
    tags: [],
  };
}
