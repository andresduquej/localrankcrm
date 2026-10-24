"use client";
import { useState, useEffect } from "react";
import { EyeOff, Globe, Moon, Palette, RotateCcw, Shield, Sun } from "lucide-react";
import { loadFromStorage, saveToStorage } from "@/lib/local-storage";
import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  loadAppearance,
  saveAppearance,
  type Appearance,
} from "@/lib/appearance";

type AppearanceConfig = { theme: "light" | "dark" | "system"; language: string };
const DEFAULT: AppearanceConfig = { theme: "light", language: "es" };

const LANGUAGES = [
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
];

export default function AppearancePage() {
  const [config, setConfig] = useState<AppearanceConfig>(DEFAULT);
  const [saved, setSaved] = useState(false);
  const [ap, setAp] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    const stored = loadFromStorage("appearance_config", DEFAULT);
    setConfig(stored);
    applyTheme(stored.theme);
    const loaded = loadAppearance();
    setAp(loaded);
    applyAppearance(loaded);
  }, []);

  function updateLook(next: Appearance) {
    setAp(next);
    applyAppearance(next);
    saveAppearance(next);
  }

  function applyTheme(theme: AppearanceConfig["theme"]) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // system
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }

  function handleThemeChange(theme: AppearanceConfig["theme"]) {
    setConfig({ ...config, theme });
    applyTheme(theme);
    saveToStorage("appearance_config", { ...config, theme });
  }

  function handleSave() {
    saveToStorage("appearance_config", config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Apariencia & Idioma</h3>
        <p className="mt-1 text-sm text-muted-foreground">Personaliza el tema visual y el idioma de la interfaz.</p>
      </div>

      {/* Theme */}
      <div className="rounded-lg border bg-white p-5 dark:bg-gray-900 dark:border-gray-700">
        <h4 className="font-medium mb-4 flex items-center gap-2">
          {config.theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          Tema
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => handleThemeChange("light")} className={`rounded-lg border p-4 text-center transition-all ${config.theme === "light" ? "border-brand ring-2 ring-brand/20" : "hover:border-gray-300"}`}>
            <div className="mx-auto mb-2 h-16 w-full rounded border bg-white flex items-end p-2">
              <div className="h-2 w-4 rounded bg-gray-200 mr-1"></div>
              <div className="h-3 w-6 rounded bg-blue-200"></div>
            </div>
            <Sun className="mx-auto h-4 w-4 mb-1" />
            <p className="text-xs font-medium">Claro</p>
          </button>
          <button onClick={() => handleThemeChange("dark")} className={`rounded-lg border p-4 text-center transition-all ${config.theme === "dark" ? "border-brand ring-2 ring-brand/20" : "hover:border-gray-300"}`}>
            <div className="mx-auto mb-2 h-16 w-full rounded border bg-gray-800 flex items-end p-2">
              <div className="h-2 w-4 rounded bg-gray-600 mr-1"></div>
              <div className="h-3 w-6 rounded bg-blue-400"></div>
            </div>
            <Moon className="mx-auto h-4 w-4 mb-1" />
            <p className="text-xs font-medium">Oscuro</p>
          </button>
          <button onClick={() => handleThemeChange("system")} className={`rounded-lg border p-4 text-center transition-all ${config.theme === "system" ? "border-brand ring-2 ring-brand/20" : "hover:border-gray-300"}`}>
            <div className="mx-auto mb-2 h-16 w-full rounded border overflow-hidden flex">
              <div className="w-1/2 bg-white flex items-end p-1"><div className="h-2 w-full rounded bg-gray-200"></div></div>
              <div className="w-1/2 bg-gray-800 flex items-end p-1"><div className="h-2 w-full rounded bg-gray-600"></div></div>
            </div>
            <span className="mx-auto block text-sm mb-1">💻</span>
            <p className="text-xs font-medium">Sistema</p>
          </button>
        </div>
      </div>

      {/* Color de acento */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="flex items-center gap-2 font-medium"><Palette className="h-4 w-4" />Color de acento</h4>
          {ap.accent && (
            <button onClick={() => updateLook({ ...ap, accent: null })} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3 w-3" />Usar el de la marca
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { name: "De la marca", accent: null as string | null },
            { name: "Azul iOS", accent: "#0a6cff" },
            { name: "Índigo", accent: "#4338ca" },
            { name: "Teal", accent: "#0d7d8c" },
            { name: "Verde", accent: "#1d6b4f" },
            { name: "Naranja", accent: "#d95f18" },
            { name: "Coral", accent: "#d64570" },
            { name: "Grafito", accent: "#3f4650" },
          ].map((p) => {
            const active = ap.accent === p.accent;
            return (
              <button key={p.name} onClick={() => updateLook({ ...ap, accent: p.accent })} className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-[13px] font-semibold transition-all active:scale-[0.98] ${active ? "border-brand bg-brand-tint" : "hover:border-gray-300"}`}>
                <span className="h-6 w-6 shrink-0 rounded-full border border-black/10" style={{ background: p.accent ?? "linear-gradient(135deg, var(--accent), var(--accent-hover))" }} />
                {p.name}
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 p-2.5">
          <input type="color" value={ap.accent ?? "#0a6cff"} onChange={(e) => updateLook({ ...ap, accent: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border-0 bg-transparent p-0" aria-label="Color personalizado" />
          <span className="text-[13px] font-medium">Color personalizado</span>
          <code className="ml-auto text-xs text-muted-foreground">{ap.accent ?? "— usa la marca —"}</code>
        </label>
        <p className="mt-2 text-[11px] text-muted-foreground">Preferencia personal de este navegador. El color oficial de la organización se define en <strong>Configuración → Marca</strong>.</p>
      </div>

      {/* Esquinas */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className="font-medium">Esquinas</h4>
            <p className="text-xs text-muted-foreground">De discretas a súper redondas (estilo iPhone)</p>
          </div>
          <code className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{ap.radius}px</code>
        </div>
        <input type="range" min={6} max={28} value={ap.radius} onChange={(e) => updateLook({ ...ap, radius: +e.target.value })} className="w-full" style={{ accentColor: "var(--accent)" }} />
        <div className="mt-2 flex gap-2">
          {[10, 16, 22, 28].map((r) => (
            <button key={r} onClick={() => updateLook({ ...ap, radius: r })} className={`flex-1 border py-2 text-[11px] font-semibold transition-all ${ap.radius === r ? "border-brand bg-brand-tint" : "hover:border-gray-300"}`} style={{ borderRadius: `${Math.min(r, 18)}px` }}>
              {r === 10 ? "Discretas" : r === 16 ? "Medias" : r === 22 ? "iOS" : "Máximas"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 p-3">
          <span className="bg-brand px-4 py-2 text-xs font-bold text-white" style={{ borderRadius: `${Math.max(6, Math.round(ap.radius * 0.45))}px` }}>Botón</span>
          <span className="flex-1 border bg-white p-3 text-xs dark:bg-gray-800" style={{ borderRadius: `${ap.radius}px` }}>Tarjeta de ejemplo con tus esquinas</span>
        </div>
      </div>

      {/* Language */}
      <div className="rounded-lg border bg-white p-5 dark:bg-gray-900 dark:border-gray-700">
        <h4 className="font-medium mb-4 flex items-center gap-2"><Globe className="h-4 w-4" />Idioma</h4>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGUAGES.map((lang) => (
            <button key={lang.code} onClick={() => setConfig({ ...config, language: lang.code })} className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-left transition-all ${config.language === lang.code ? "border-brand ring-2 ring-brand/20 bg-brand-tint" : "hover:border-gray-300"}`}>
              <span className="text-lg">{lang.flag}</span>
              <div>
                <p className="text-sm font-medium">{lang.name}</p>
                <p className="text-[10px] text-muted-foreground">{lang.code.toUpperCase()}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">El cambio de idioma se aplicará a toda la interfaz del CRM.</p>
      </div>

      <button onClick={handleSave} className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover">{saved ? "✓ Guardado" : "Guardar preferencias"}</button>

      {/* Blur / Privacy Mode */}
      <div className="rounded-lg border bg-white p-5 dark:bg-gray-900 dark:border-gray-700">
        <h4 className="font-medium mb-2 flex items-center gap-2"><EyeOff className="h-4 w-4" />Modo Privacidad (Blur)</h4>
        <p className="text-xs text-muted-foreground mb-4">Oculta el contenido de modulos sensibles con un blur. Util cuando compartes pantalla o alguien ve tu monitor. Puedes activar/desactivar desde cada modulo con el boton <EyeOff className="inline h-3 w-3" />.</p>
        <BlurConfig />
      </div>
    </div>
  );
}

const BLUR_MODULES = [
  { id: "contacts", label: "Contactos" },
  { id: "pipeline", label: "Pipeline" },
  { id: "opportunities", label: "Oportunidades" },
  { id: "cartera", label: "Cartera" },
  { id: "proposals", label: "Propuestas" },
  { id: "inbox", label: "Conversaciones" },
  { id: "analytics", label: "Analytics" },
  { id: "notes", label: "Notas" },
  { id: "team", label: "Equipo" },
];

function BlurConfig() {
  const [blurConfig, setBlurConfig] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBlurConfig(JSON.parse(localStorage.getItem("module_blur_config") || "{}"));
    }
  }, []);

  function toggleModule(id: string) {
    const next = { ...blurConfig, [id]: !blurConfig[id] };
    setBlurConfig(next);
    localStorage.setItem("module_blur_config", JSON.stringify(next));
  }

  function blurAll() {
    const all: Record<string, boolean> = {};
    BLUR_MODULES.forEach(m => { all[m.id] = true; });
    setBlurConfig(all);
    localStorage.setItem("module_blur_config", JSON.stringify(all));
  }

  function clearAll() {
    setBlurConfig({});
    localStorage.setItem("module_blur_config", JSON.stringify({}));
  }

  const activeCount = Object.values(blurConfig).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={blurAll} className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-gray-50 flex items-center gap-1"><Shield className="h-3 w-3" />Blurear todo</button>
        <button onClick={clearAll} className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-gray-50">Quitar todo</button>
        {activeCount > 0 && <span className="text-xs text-amber-600">{activeCount} modulo{activeCount > 1 ? "s" : ""} oculto{activeCount > 1 ? "s" : ""}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {BLUR_MODULES.map(mod => (
          <button key={mod.id} onClick={() => toggleModule(mod.id)} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all ${blurConfig[mod.id] ? "bg-amber-50 border-amber-200 text-amber-700" : "hover:border-gray-300"}`}>
            {blurConfig[mod.id] ? <EyeOff className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-gray-300" />}
            {mod.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">Tip: tambien puedes activar/desactivar el blur desde cualquier pagina con el boton flotante abajo a la derecha.</p>
    </div>
  );
}
