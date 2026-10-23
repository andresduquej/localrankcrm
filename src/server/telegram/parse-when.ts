/**
 * Parser de fecha/hora en español para el comando /cita del bot de Telegram.
 * Interpreta la hora del usuario en America/Bogota (UTC-5 fijo, sin horario
 * de verano), de forma determinística y testeable.
 *
 * Ejemplos que soporta:
 *   /cita reunion con Juan mañana 3pm
 *   /cita hoy 15:30 llamada de seguimiento
 *   /cita jueves 10am cortar pelo
 *   /cita 25/12 2pm almuerzo navidad
 *   /cita 2026-11-03 14:00 auditoria
 */

export const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000; // UTC-5 fijo

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

const DATE_PATTERNS: { re: RegExp; apply: (m: RegExpMatchArray, wall: Date) => Date | null }[] = [
  {
    re: /\bpasado\s+ma[ñn]ana\b/i,
    apply: (_m, wall) => addDays(startOfDay(wall), 2),
  },
  {
    re: /\b(ma[ñn]ana)\b/i,
    apply: (_m, wall) => addDays(startOfDay(wall), 1),
  },
  {
    re: /\b(hoy)\b/i,
    apply: (_m, wall) => startOfDay(wall),
  },
  {
    re: /\b(pr[óo]ximo\s+)?(domingo|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado)\b/i,
    apply: (m, wall) => {
      const target = WEEKDAYS[m[2]!.toLowerCase()];
      if (target === undefined) return null;
      const base = startOfDay(wall);
      let diff = (target - base.getUTCDay() + 7) % 7;
      if (diff === 0) diff = 7; // "el lunes" dicho en lunes → el próximo
      if (m[1]) diff = diff === 0 ? 7 : diff; // "próximo" explícito (ya ≥1)
      return addDays(base, diff);
    },
  },
  {
    // ISO primero: si no, dd/mm muerde "2026-11-03" como "11-03".
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    apply: (m) => {
      const year = parseInt(m[1]!, 10);
      const month = parseInt(m[2]!, 10);
      const day = parseInt(m[3]!, 10);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return new Date(Date.UTC(year, month - 1, day));
    },
  },
  {
    // Guardas (?<![\d-]) / (?![\d-]) para no tropezar con años ni rangos.
    re: /(?<![\d-])(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?![\d-])/,
    apply: (m, wall) => {
      const day = parseInt(m[1]!, 10);
      const month = parseInt(m[2]!, 10);
      let year = m[3] ? parseInt(m[3]!, 10) : wall.getUTCFullYear();
      if (year < 100) year += 2000;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return new Date(Date.UTC(year, month - 1, day));
    },
  },
];

// Hora: "3pm", "3 pm", "15:30", "3:30pm", "3am", "3h", "a las 3", "a las 15:30"
const TIME_RE =
  /\b(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|h(?:rs)?)?\b/i;

function parseTimeToken(text: string): { hour: number; minute: number; matched: string } | null {
  const m = text.match(TIME_RE);
  if (!m) return null;
  // Si no hay marcador (am/pm/h/:) no es una hora — es un número del título.
  if (!m[3] && !m[2]) return null;
  let hour = parseInt(m[1]!, 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const marker = m[3]?.toLowerCase().replace(/\./g, "");
  if (hour < 0 || hour > 23 || minute > 59) return null;
  if (marker === "pm" && hour < 12) hour += 12;
  if (marker === "am" && hour === 12) hour = 0;
  return { hour, minute, matched: m[0] };
}

function startOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export type ParsedWhen = {
  startsAt: Date;
  title: string;
};

/**
 * Extrae fecha, hora y título del texto de una cita.
 * - Sin hora → 09:00. Sin fecha → hoy si la hora aún no pasó, si no mañana.
 * - Devuelve null si no hay ni fecha ni hora reconocibles, o si queda en el
 *   pasado.
 */
export function parseWhen(raw: string, now: Date = new Date()): ParsedWhen | null {
  let text = ` ${raw.trim()} `;
  const wall = new Date(now.getTime() + BOGOTA_OFFSET_MS); // hora "de pared" Bogotá como UTC

  let day: Date | null = null;
  let consumed = "";
  for (const { re, apply } of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const applied = apply(m, wall);
      if (applied) {
        day = applied;
        consumed = m[0];
        text = text.replace(m[0], " ");
      }
      break;
    }
  }

  const time = parseTimeToken(text);
  if (time) {
    text = text.replace(time.matched, " ");
  }

  if (!day && !time) return null;

  const hour = time?.hour ?? 9;
  const minute = time?.minute ?? 0;
  const base = day ?? startOfDay(wall);
  // Fecha en pared Bogotá → epoch real (UTC-5)
  let startsAt = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      hour,
      minute
    ) - BOGOTA_OFFSET_MS
  );

  // Sin fecha explícita y hora ya pasada hoy → mañana a esa hora.
  if (!day && startsAt.getTime() <= now.getTime()) {
    startsAt = new Date(startsAt.getTime() + 86_400_000);
  }
  // "hoy 8am" dicho a las 3pm: el usuario casi siempre quiere mañana.
  const relativeDay =
    !day ||
    /^(hoy|ma[ñn]ana|pasado\s+ma[ñn]ana)$/i.test(consumed.trim());
  if (day && relativeDay && startsAt.getTime() <= now.getTime()) {
    startsAt = new Date(startsAt.getTime() + 86_400_000);
  }
  if (startsAt.getTime() <= now.getTime()) return null; // fecha explícita pasada → error
  if (startsAt.getTime() > now.getTime() + 365 * 86_400_000) return null;

  const title = text
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, "")
    .trim();

  return { startsAt, title: title || "Cita" };
}

/** Formatea una fecha en hora de Bogotá para respuestas del bot. */
export function formatBogota(d: Date): string {
  const wall = new Date(d.getTime() + BOGOTA_OFFSET_MS);
  const days = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days[wall.getUTCDay()]} ${wall.getUTCDate()} ${months[wall.getUTCMonth()]} ${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}
