import { parseWhen } from "./parse-when";

/**
 * Respaldo determinista para crear citas desde el chat del asistente.
 *
 * Los modelos pequeños a veces CONFIRMAN con palabras ("Listo, te aparté la
 * cita") y se olvidan de incluir el campo "action" — la cita nunca se crea.
 * Si el mensaje del usuario pide claramente crear una cita y el modelo no
 * devolvió acción, este parser (el mismo del bot de Telegram, probado) la
 * construye igual: fecha/hora en Bogotá incluidas.
 */

/** Verbos que expresan intención de CREAR una cita (imperativos reales:
 *  apárte-me, créa-me — con la e tónica, no "apartame"). */
const PEDIDO_RE =
  /\b(ap[aá]rte(?:me|nos)?|ap[aá]rtame|ag[eé]ndame|cr[eé]a(?:me)?|crea|h[aá]zme|pon(?:me)?|reg[ií]strame)\b/i;
/** Reprogramar NO va por aquí: necesita la cita existente (acción del modelo). */
const REPROGRAMA_RE = /\b(reprograma|p[aá]sala|mue[vv]e|cambia(?:r)?\s+(?:la\s+)?(?:cita|hora|d[ií]a))\b/i;
/** Debe hablar de citas/reuniones para activarse. */
const TEMA_RE = /\b(cita|reuni[oó]n|meeting)\b/i;

export type CitaFallback = {
  type: "create_appointment";
  title: string;
  startsAt: string; // ISO
};

/** Puro y testeable: null = no hay respaldo (lo maneja el modelo o nadie). */
export function citaDesdeTexto(message: string, now: Date = new Date()): CitaFallback | null {
  if (REPROGRAMA_RE.test(message)) return null;
  if (!PEDIDO_RE.test(message)) return null;
  if (!TEMA_RE.test(message)) return null;

  const limpio = message
    .replace(PEDIDO_RE, " ")
    .replace(/\b(una|un)\s+(cita|reuni[oó]n|meeting)\b/gi, " ")
    .replace(/\b(cita|reuni[oó]n|meeting)\b/gi, " ")
    .replace(/\b(por\s+favor|plist)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const parsed = parseWhen(limpio, now);
  if (!parsed) return null;
  return {
    type: "create_appointment",
    title: parsed.title,
    startsAt: parsed.startsAt.toISOString(),
  };
}
