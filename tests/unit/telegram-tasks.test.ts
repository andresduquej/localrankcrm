import { describe, expect, it } from "vitest";
import {
  nagTone,
  parseDurationMin,
  parseTaskText,
  priorityLabel,
} from "@/server/telegram/tasks";

/** Funciones puras del mayordomo de tareas (sin BD). */

describe("parseDurationMin", () => {
  it("minutos: 15 min, 30min, 45m", () => {
    expect(parseDurationMin("llamar 15 min")).toBe(15);
    expect(parseDurationMin("revisar 30min")).toBe(30);
    expect(parseDurationMin("limpiar 45m")).toBe(45);
  });

  it("horas: 1h, 2 horas", () => {
    expect(parseDurationMin("proyecto 1h")).toBe(60);
    expect(parseDurationMin("taller 2 horas")).toBe(120);
  });

  it("sin duración → null", () => {
    expect(parseDurationMin("llamar a Juan")).toBeNull();
  });
});

describe("parseTaskText", () => {
  it("extrae prioridad y duración y limpia el título", () => {
    const r = parseTaskText("llamar a Juan, urgente, 30 min");
    expect(r.title).toBe("llamar a Juan");
    expect(r.priority).toBe("high");
    expect(r.durationMin).toBe(30);
  });

  it("prioridad media por defecto", () => {
    const r = parseTaskText("comprar mercado");
    expect(r.priority).toBe("medium");
    expect(r.durationMin).toBeNull();
    expect(r.title).toBe("comprar mercado");
  });

  it("baja → low", () => {
    expect(parseTaskText("ordenar archivos baja").priority).toBe("low");
  });

  it("urgente → high", () => {
    expect(parseTaskText("pagar nómina urgente").priority).toBe("high");
  });

  it("título vacío tras tokens → Tarea", () => {
    expect(parseTaskText("urgente 15 min").title).toBe("Tarea");
  });
});

describe("nagTone", () => {
  it("escala con las horas de atraso", () => {
    expect(nagTone(0.5)).toContain("😐");
    expect(nagTone(3)).toContain("😠");
    expect(nagTone(9)).toContain("🤬");
    expect(nagTone(9)).toContain("9 HORAS");
  });
});

describe("priorityLabel", () => {
  it("mapea a etiquetas con emoji", () => {
    expect(priorityLabel("high")).toContain("Alta");
    expect(priorityLabel("medium")).toContain("Media");
    expect(priorityLabel("low")).toContain("Baja");
  });
});
