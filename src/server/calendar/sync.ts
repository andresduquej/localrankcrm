import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { BOGOTA_OFFSET_MS } from "@/server/telegram/parse-when";

/**
 * Sincronización de calendarios externos:
 * - ics: Google Calendar (URL secreta iCal) y cualquier .ics — sin OAuth.
 * - calendly / calcom: token de API del usuario.
 * Los eventos se guardan en calendar_event (upsert por source+externalId).
 */

export type ExternalEvent = {
  externalId: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  url: string;
};

/* ── ICS (RFC 5545, mínimo suficiente para Google Calendar) ───────────── */

/** Despliega líneas continuas (las que empiezan con espacio o tab). */
function unfoldIcs(raw: string): string[] {
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** DTSTART/DTEND: soporta Z (UTC), fecha flotante y con TZID (≈ Bogotá). */
function parseIcsDate(value: string, params: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
  if (!m) return null;
  const y = m[1]!, mo = m[2]!, d = m[3]!;
  const h = m[4] ?? "00", mi = m[5] ?? "00", s = m[6] ?? "00";
  const z = m[7];
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  if (z === "Z") return new Date(`${iso}Z`);
  if (params.includes("TZID=") || params === "") {
    // Flotante o con zona: Google las entrega en la zona del calendario
    // (el usuario está en Colombia) — se interpreta como Bogotá UTC-5.
    // Date.UTC evita depender del huso de la máquina que ejecuta el código.
    return new Date(
      Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - BOGOTA_OFFSET_MS
    );
  }
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/** Extrae los VEVENT de un .ics. Puro, testeable. */
export function parseIcs(raw: string): ExternalEvent[] {
  const events: ExternalEvent[] = [];
  let cur: Partial<ExternalEvent> | null = null;
  for (const line of unfoldIcs(raw)) {
    if (line.startsWith("BEGIN:VEVENT")) cur = {};
    else if (line.startsWith("END:VEVENT")) {
      if (cur?.startsAt && cur.title) {
        events.push({
          externalId: cur.externalId ?? `${cur.title}-${cur.startsAt.toISOString()}`,
          title: cur.title,
          startsAt: cur.startsAt,
          endsAt: cur.endsAt ?? null,
          location: cur.location ?? "",
          url: cur.url ?? "",
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^([A-Z-]+)(;[^:]*)?:([^$]*)$/);
    if (!m) continue;
    const [, key, params = "", value = ""] = m;
    const v = value.trim();
    if (key === "UID") cur.externalId = v;
    else if (key === "SUMMARY") cur.title = v.replace(/\\,/g, ",").replace(/\\n/gi, " ");
    else if (key === "DTSTART") cur.startsAt = parseIcsDate(v, params) ?? undefined;
    else if (key === "DTEND") cur.endsAt = parseIcsDate(v, params) ?? undefined;
    else if (key === "LOCATION") cur.location = v.slice(0, 200);
    else if (key === "URL") cur.url = v.slice(0, 500);
  }
  return events;
}

/* ── Proveedores con API ──────────────────────────────────────────────── */

async function fetchCalendly(token: string): Promise<ExternalEvent[]> {
  const now = new Date();
  const min = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const max = new Date(now.getTime() + 90 * 86_400_000).toISOString();
  const res = await fetch(
    `https://api.calendly.com/scheduled_events?min_start_time=${min}&max_start_time=${max}&count=100&sort=start_time`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Calendly respondió ${res.status}`);
  const json = (await res.json()) as {
    collection?: {
      uri: string;
      name: string;
      start_time: string;
      end_time: string;
      location?: { location?: string };
    }[];
  };
  return (json.collection ?? []).map((e) => ({
    externalId: e.uri,
    title: e.name,
    startsAt: new Date(e.start_time),
    endsAt: new Date(e.end_time),
    location: e.location?.location ?? "",
    url: e.uri,
  }));
}

async function fetchCalCom(token: string): Promise<ExternalEvent[]> {
  const res = await fetch("https://api.cal.com/v2/bookings?status=upcoming&take=100", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cal.com respondió ${res.status}`);
  const json = (await res.json()) as {
    data?: {
      bookings?: {
        uid: string;
        title: string;
        start: string;
        endTime?: string;
        metadata?: { location?: string };
      }[];
    };
  };
  return (json.data?.bookings ?? []).map((b) => ({
    externalId: b.uid,
    title: b.title,
    startsAt: new Date(b.start),
    endsAt: b.endTime ? new Date(b.endTime) : null,
    location: b.metadata?.location ?? "",
    url: `https://app.cal.com/booking/${b.uid}`,
  }));
}

/* ── Orquestación sobre la BD ─────────────────────────────────────────── */

export type SourceRow = typeof schema.calendarSource.$inferSelect;

function tokenOf(source: SourceRow): string | null {
  if (!source.tokenCipher || !source.tokenIv || !source.tokenTag) return null;
  return decryptSecret({ cipher: source.tokenCipher, iv: source.tokenIv, tag: source.tokenTag });
}

async function fetchEvents(source: SourceRow): Promise<ExternalEvent[]> {
  if (source.type === "ics") {
    if (!source.url) throw new Error("Sin URL del calendario");
    const res = await fetch(source.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`El calendario respondió ${res.status}`);
    return parseIcs(await res.text());
  }
  const token = tokenOf(source);
  if (!token) throw new Error("Sin token guardado");
  if (source.type === "calendly") return fetchCalendly(token);
  if (source.type === "calcom") return fetchCalCom(token);
  throw new Error(`Tipo desconocido: ${source.type}`);
}

/** Sincroniza una fuente: trae eventos y hace upsert. Devuelve cuántos guardó. */
export async function syncSource(source: SourceRow): Promise<number> {
  const db = getDb();
  let fetched: ExternalEvent[];
  try {
    fetched = await fetchEvents(source);
  } catch (err) {
    await db
      .update(schema.calendarSource)
      .set({ lastError: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
      .where(eq(schema.calendarSource.id, source.id));
    throw err;
  }
  const horizonte = new Date(Date.now() - 30 * 86_400_000);
  const futuros = fetched.filter((e) => e.startsAt >= horizonte).slice(0, 500);
  for (const e of futuros) {
    await db
      .insert(schema.calendarEvent)
      .values({
        id: newId("calendarEvent"),
        organizationId: source.organizationId,
        sourceId: source.id,
        externalId: e.externalId,
        title: e.title.slice(0, 300),
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
        url: e.url,
      })
      .onConflictDoUpdate({
        target: [schema.calendarEvent.sourceId, schema.calendarEvent.externalId],
        set: {
          title: e.title.slice(0, 300),
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          location: e.location,
          url: e.url,
        },
      });
  }
  await db
    .update(schema.calendarSource)
    .set({ lastSyncAt: new Date(), lastError: "", updatedAt: new Date() })
    .where(eq(schema.calendarSource.id, source.id));
  return futuros.length;
}

export async function syncAllSources(organizationId: string): Promise<{ synced: number; events: number; errors: string[] }> {
  const db = getDb();
  const sources = await db
    .select()
    .from(schema.calendarSource)
    .where(
      and(eq(schema.calendarSource.organizationId, organizationId), eq(schema.calendarSource.enabled, true))
    );
  let events = 0;
  let synced = 0;
  const errors: string[] = [];
  for (const s of sources) {
    try {
      events += await syncSource(s);
      synced++;
    } catch (err) {
      errors.push(`${s.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { synced, events, errors };
}

/** Eventos de la org en [from, to] con el nombre de su fuente. */
export async function listEvents(
  organizationId: string,
  from: Date,
  to: Date
): Promise<(typeof schema.calendarEvent.$inferSelect & { sourceName: string; sourceType: string })[]> {
  const db = getDb();
  const rows = await db
    .select({
      event: schema.calendarEvent,
      sourceName: schema.calendarSource.name,
      sourceType: schema.calendarSource.type,
    })
    .from(schema.calendarEvent)
    .innerJoin(schema.calendarSource, eq(schema.calendarSource.id, schema.calendarEvent.sourceId))
    .where(
      and(
        eq(schema.calendarEvent.organizationId, organizationId),
        gte(schema.calendarEvent.startsAt, from),
        lte(schema.calendarEvent.startsAt, to)
      )
    );
  return rows.map((r) => ({ ...r.event, sourceName: r.sourceName, sourceType: r.sourceType }));
}

export { encryptSecret };
