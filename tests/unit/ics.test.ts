import { describe, expect, it } from "vitest";
import { parseIcs } from "@/server/calendar/sync";

/** Parser ICS puro (Google Calendar / cualquier .ics) — sin red ni BD. */

const FIXTURE = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VEVENT",
  "DTSTART:20261103T190000Z",
  "DTEND:20261103T200000Z",
  "SUMMARY:Reunión con Juan",
  "LOCATION:Oficina",
  "URL:https://calendar.google.com/x",
  "UID:evt-1@google.com",
  "END:VEVENT",
  "BEGIN:VEVENT",
  // Línea plegada (RFC 5545) + flotante en hora local (Bogotá)
  "SUMMARY:Almuerzo largo con María y",
  "  el equipo",
  "DTSTART:20261105T120000",
  "UID:evt-2@google.com",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  it("extrae los VEVENT con título, fechas, lugar y URL", () => {
    const evts = parseIcs(FIXTURE);
    expect(evts).toHaveLength(2);
    const e1 = evts[0]!;
    expect(e1.title).toBe("Reunión con Juan");
    expect(e1.externalId).toBe("evt-1@google.com");
    expect(e1.startsAt.toISOString()).toBe("2026-11-03T19:00:00.000Z");
    expect(e1.endsAt?.toISOString()).toBe("2026-11-03T20:00:00.000Z");
    expect(e1.location).toBe("Oficina");
    expect(e1.url).toContain("calendar.google.com");
  });

  it("despliega líneas plegadas (título en dos líneas)", () => {
    const e2 = parseIcs(FIXTURE)[1]!;
    expect(e2.title).toBe("Almuerzo largo con María y el equipo");
  });

  it("interpreta la hora flotante como Bogotá (UTC-5)", () => {
    const e2 = parseIcs(FIXTURE)[1]!;
    // 12:00 flotante Bogotá → 17:00 UTC
    expect(e2.startsAt.toISOString()).toBe("2026-11-05T17:00:00.000Z");
  });

  it("ignora VEVENT sin título o sin fecha", () => {
    const raros = parseIcs(["BEGIN:VEVENT", "SUMMARY:Solo título", "END:VEVENT", "BEGIN:VEVENT", "DTSTART:20260101T100000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n"));
    expect(raros).toHaveLength(0);
  });

  it("texto vacío → lista vacía sin lanzar", () => {
    expect(parseIcs("")).toEqual([]);
    expect(parseIcs("no es un ics")).toEqual([]);
  });
});
