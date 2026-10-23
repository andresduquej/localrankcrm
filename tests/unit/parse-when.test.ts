import { describe, expect, it } from "vitest";
import { formatBogota, parseWhen } from "@/server/telegram/parse-when";

/**
 * now fijo: viernes 2026-10-23 15:00 hora Colombia (20:00 UTC).
 * Todas las aserciones en hora de Bogotá (UTC-5 fijo).
 */
const NOW = new Date("2026-10-23T20:00:00Z");

function fmt(d: Date) {
  return formatBogota(d);
}

describe("parser de citas (/cita) — hora Colombia", () => {
  it("relativa simple: mañana 3pm", () => {
    const r = parseWhen("reunión con Juan mañana 3pm", NOW);
    expect(r).not.toBeNull();
    expect(fmt(r!.startsAt)).toBe("sáb 24 oct 15:00");
    expect(r!.title).toBe("reunión con Juan");
  });

  it("hoy con hora futura", () => {
    const r = parseWhen("hoy 22:30 llamada de seguimiento", NOW);
    expect(fmt(r!.startsAt)).toBe("vie 23 oct 22:30");
    expect(r!.title).toBe("llamada de seguimiento");
  });

  it("hoy con hora ya pasada → se va para mañana", () => {
    const r = parseWhen("hoy 8am gimnasio", NOW);
    expect(fmt(r!.startsAt)).toBe("sáb 24 oct 08:00");
  });

  it("día de semana: jueves 10am", () => {
    const r = parseWhen("jueves 10am cortar pelo", NOW);
    expect(fmt(r!.startsAt)).toBe("jue 29 oct 10:00");
    expect(r!.title).toBe("cortar pelo");
  });

  it("fecha numérica dd/mm", () => {
    const r = parseWhen("25/12 2pm almuerzo de navidad", NOW);
    expect(fmt(r!.startsAt)).toBe("vie 25 dic 14:00");
    expect(r!.title).toBe("almuerzo de navidad");
  });

  it("ISO completo", () => {
    const r = parseWhen("2026-11-03 14:00 auditoría", NOW);
    expect(fmt(r!.startsAt)).toBe("mar 3 nov 14:00");
  });

  it("solo hora (sin fecha) → hoy si alcanza", () => {
    const r = parseWhen("a las 23h cerrar tienda", NOW);
    expect(fmt(r!.startsAt)).toBe("vie 23 oct 23:00");
    expect(r!.title).toBe("cerrar tienda");
  });

  it("solo fecha (sin hora) → 09:00 por defecto", () => {
    const r = parseWhen("mañana entrega de propuesta", NOW);
    expect(fmt(r!.startsAt)).toBe("sáb 24 oct 09:00");
    expect(r!.title).toBe("entrega de propuesta");
  });

  it("pasado mañana", () => {
    const r = parseWhen("pasado mañana 11am veterinaria", NOW);
    expect(fmt(r!.startsAt)).toBe("dom 25 oct 11:00");
  });

  it("números del título no se confunden con hora", () => {
    const r = parseWhen("revisión contrato 2027 con el contador mañana 4pm", NOW);
    expect(r).not.toBeNull();
    expect(fmt(r!.startsAt)).toBe("sáb 24 oct 16:00");
    expect(r!.title).toContain("2027");
  });

  it("fecha en el pasado → null", () => {
    expect(parseWhen("2026-01-01 10:00 algo", NOW)).toBeNull();
  });

  it("sin fecha ni hora → null", () => {
    expect(parseWhen("llamar a mamá", NOW)).toBeNull();
  });

  it("sin texto → título por defecto", () => {
    const r = parseWhen("mañana 3pm", NOW);
    expect(r!.title).toBe("Cita");
  });
});
