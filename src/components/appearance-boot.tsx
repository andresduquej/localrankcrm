"use client";

import { useEffect } from "react";
import { applyAppearance, loadAppearance } from "@/lib/appearance";

/**
 * Aplica en el arranque de la app la apariencia guardada (tema claro/oscuro
 * + acento + esquinas). Antes los cambios se guardaban en localStorage pero
 * nada los volvía a aplicar al recargar: por eso "no quedaban grabados".
 * Llave única del tema: localrank_appearance_config (la misma del toggle
 * del sidebar), con {theme: light|dark|system}.
 */

const THEME_KEY = "localrank_appearance_config";

function aplicarTema(theme: string | null | undefined) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "light") root.classList.remove("dark");
  else {
    // system
    root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
}

export function AppearanceBoot() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      aplicarTema(raw ? (JSON.parse(raw) as { theme?: string }).theme : "system");
    } catch {
      aplicarTema("system");
    }
    applyAppearance(loadAppearance());
  }, []);
  return null;
}
