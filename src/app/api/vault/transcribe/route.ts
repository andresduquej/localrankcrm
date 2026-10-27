import { apiError, withAuth } from "@/lib/api";
import { getAiSettings } from "@/server/ai/settings";

export const dynamic = "force-dynamic";

/**
 * Transcribe un video/audio corto (≤ 4.5 MB, límite del body serverless)
 * con Whisper en GROQ y devuelve el texto. La transcripción luego pasa por
 * /api/vault/parse para resumirla y por la búsqueda de GitHub desde la UI.
 */

const MAX_BYTES = 4_500_000;
const GROQ_TRANSCRIBE = "https://api.groq.com/openai/v1/audio/transcriptions";

export const POST = withAuth(async (session, req: Request) => {
  // Prioridad: la key de GROQ cifrada en ai_settings (proveedor activo groq);
  // si no, una GROQ_API_KEY del entorno como respaldo de despliegue.
  const settings = await getAiSettings(session.organizationId);
  const groqKey =
    (settings?.provider === "groq" && settings.apiKey) || process.env.GROQ_API_KEY || null;
  if (!groqKey) {
    return apiError(
      503,
      "whisper_not_configured",
      "Para transcribir necesitas una llave de GROQ (gratis): 1) entra a groq.com/console/keys y crea una API key, 2) en la app ve a Ajustes → IA / APIs, elige el proveedor GROQ y pégala ahí."
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(422, "invalid_body", "Se esperaba multipart/form-data con 'file'");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(422, "invalid_file", "Falta el archivo en el campo 'file'");
  }
  if (file.size > MAX_BYTES) {
    return apiError(
      413,
      "too_large",
      `El archivo pesa ${(file.size / 1e6).toFixed(1)} MB — el límite por ahora es 4.5 MB (videos cortos o notas de voz).`
    );
  }
  if (file.size < 500) {
    return apiError(422, "invalid_file", "El archivo está vacío o es demasiado corto.");
  }

  // Whisper acepta mp4/webm/m4a/mp3/wav; normalizamos el nombre con extensión.
  const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const upstream = new FormData();
  upstream.append("file", file, `video.${ext}`);
  upstream.append("model", "whisper-large-v3-turbo");
  upstream.append("language", "es");
  upstream.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(GROQ_TRANSCRIBE, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: upstream,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[vault/transcribe] groq", res.status, text.slice(0, 200));
      return apiError(502, "whisper_error", `Whisper respondió ${res.status}. Intenta de nuevo.`);
    }
    const json = (await res.json()) as { text?: string };
    const transcript = (json.text ?? "").trim();
    if (!transcript) {
      return apiError(422, "empty_transcript", "No se entendió nada del audio (¿está mute?)");
    }
    return Response.json({ ok: true, transcript });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return apiError(504, "timeout", "La transcripción tardó demasiado — prueba un video más corto.");
    }
    console.error("[vault/transcribe]", err);
    return apiError(500, "internal", "No se pudo transcribir");
  } finally {
    clearTimeout(timer);
  }
});
