/**
 * Apariencia personal del usuario: acento + redondeo de esquinas + modo
 * oscuro, guardados en localStorage y aplicados como variables CSS en
 * <html>. Es una preferencia visual del navegador (no la marca de la
 * organización, que vive en Configuración → Marca).
 */

export type Appearance = {
  accent: string | null; // null = usar el de la marca de la organización
  radius: number;        // radio base de tarjeta (6–28)
};

const KEY = "localrank_appearance_v2";

export const DEFAULT_APPEARANCE: Appearance = { accent: null, radius: 22 };

export function loadAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<Appearance>;
    return {
      accent: typeof parsed.accent === "string" ? parsed.accent : null,
      radius:
        typeof parsed.radius === "number" && parsed.radius >= 6 && parsed.radius <= 28
          ? Math.round(parsed.radius)
          : DEFAULT_APPEARANCE.radius,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(a: Appearance): void {
  localStorage.setItem(KEY, JSON.stringify(a));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i]! - v) * t));
};

/** Deriva la familia completa del acento (mismo criterio del white-label). */
export function accentSet(accent: string): { accent: string; hover: string; soft: string; tint: string; text: string } {
  let a = accent;
  const lum = (() => {
    const [r, g, b] = hexToRgb(a).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  })();
  if (lum > 0.32) a = mix(a, "#000000", Math.min(0.55, (lum - 0.25) * 1.6));
  return {
    accent: a,
    hover: mix(a, "#000000", 0.18),
    soft: mix(a, "#ffffff", 0.82),
    tint: mix(a, "#ffffff", 0.93),
    text: mix(a, "#000000", 0.5),
  };
}

/** Aplica la apariencia al <html> (variables CSS del sistema Atlas). */
export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  if (a.accent && /^#[0-9a-fA-F]{6}$/.test(a.accent)) {
    const set = accentSet(a.accent);
    const dark = root.classList.contains("dark");
    root.style.setProperty("--accent", set.accent);
    root.style.setProperty("--accent-hover", set.hover);
    root.style.setProperty("--accent-soft", dark ? mix(set.accent, "#1a1f2e", 0.78) : set.soft);
    root.style.setProperty("--accent-tint", dark ? mix(set.accent, "#1a1f2e", 0.9) : set.tint);
    root.style.setProperty("--accent-text", dark ? mix(set.accent, "#ffffff", 0.4) : set.text);
    if (!dark) root.style.setProperty("--sidebar-bg", set.accent);
  } else {
    // volver al tema de la organización
    ["--accent", "--accent-hover", "--accent-soft", "--accent-tint", "--accent-text", "--sidebar-bg"].forEach(
      (v) => root.style.removeProperty(v)
    );
  }
  const r = a.radius;
  root.style.setProperty("--radius-sm", `${Math.max(4, Math.round(r * 0.28))}px`);
  root.style.setProperty("--radius-md", `${Math.max(6, Math.round(r * 0.45))}px`);
  root.style.setProperty("--radius-lg", `${Math.max(8, Math.round(r * 0.64))}px`);
  root.style.setProperty("--radius-xl", `${Math.max(10, Math.round(r * 0.82))}px`);
  root.style.setProperty("--radius-2xl", `${r}px`);
  root.style.setProperty("--radius-3xl", `${Math.min(34, r + 6)}px`);
}
