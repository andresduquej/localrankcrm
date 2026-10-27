import { describe, expect, it } from "vitest";
import { BOGOTA_OFFSET_MS } from "@/server/telegram/parse-when";
import { citaDesdeTexto } from "@/server/telegram/cita-fallback";

/** Mañana a una hora dada de Bogotá, en ISO — igual que parseWhen. */
function mananaBogota(hour: number, minute = 0): string {
  const wall = new Date(Date.now() + BOGOTA_OFFSET_MS + 86_400_000);
  const base = Date.UTC(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    hour,
    minute
  );
  return new Date(base - BOGOTA_OFFSET_MS).toISOString();
}

describe("citaDesdeTexto (respaldo determinista del asistente)", () => {
  it("apárteme una cita mañana 3pm → create_appointment a las 15:00 Bogotá", () => {
    const r = citaDesdeTexto("Apárteme una cita mañana 3pm con Juan de ventas");
    expect(r).not.toBeNull();
    expect(r!.type).toBe("create_appointment");
    expect(r!.startsAt).toBe(mananaBogota(15));
    expect(r!.title.toLowerCase()).toContain("juan");
  });

  it("hazme una cita con Carlos el jueves 2pm → ok", () => {
    const r = citaDesdeTexto("hazme una cita con Carlos el jueves 2pm");
    expect(r).not.toBeNull();
    expect(r!.title.toLowerCase()).toContain("carlos");
  });

  it("reprogramar NO crea cita nueva (va por la acción del modelo)", () => {
    expect(citaDesdeTexto("reprograma la cita de mañana para las 4")).toBeNull();
    expect(citaDesdeTexto("pásala al martes 4pm")).toBeNull();
  });

  it("preguntas sin verbo de creación no inventan citas", () => {
    expect(citaDesdeTexto("¿qué citas tengo mañana?")).toBeNull();
    expect(citaDesdeTexto("cuáles son mis reuniones de esta semana")).toBeNull();
  });

  it("sin fecha ni hora reconocibles → null (nada que crear)", () => {
    expect(citaDesdeTexto("apárteme una cita con Juan en algún momento")).toBeNull();
  });
});
