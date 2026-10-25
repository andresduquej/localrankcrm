"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Check, AlertCircle, Loader2 } from "lucide-react";

/**
 * Ajustes → IA / APIs. La fuente de verdad es la BD (ai_settings por
 * organización, API key cifrada): UN solo proveedor activo. Se mantiene un
 * espejo en localStorage (localrank_openrouter_key / localrank_ai_providers)
 * para que las páginas preview sigan funcionando sin cambios.
 */

type Provider = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  docsUrl: string;
  models: string[];
  free?: boolean;
};

const AI_PROVIDERS: Provider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Acceso unificado a cientos de modelos (Claude, GPT, Llama, Mistral, etc.)",
    baseUrl: "https://openrouter.ai/api",
    docsUrl: "https://openrouter.ai/docs",
    models: ["openrouter/auto", "anthropic/claude-sonnet-4", "openai/gpt-4o", "meta-llama/llama-3.1-405b", "google/gemini-2.5-pro"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o-mini, o1 y más",
    baseUrl: "https://api.openai.com/v1",
    docsUrl: "https://platform.openai.com/docs",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Claude Sonnet 4, Claude Opus 4, Haiku",
    baseUrl: "https://api.anthropic.com/v1",
    docsUrl: "https://docs.anthropic.com",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-3-20240307"],
  },
  {
    id: "google",
    name: "Google (Gemini)",
    description: "Gemini 2.5 Pro, Flash, y modelos multimodales",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    docsUrl: "https://ai.google.dev/docs",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    description: "Grok-2, Grok-2-mini para conversaciones avanzadas",
    baseUrl: "https://api.x.ai/v1",
    docsUrl: "https://docs.x.ai",
    models: ["grok-2", "grok-2-mini"],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Modelos optimizados para GPU: Llama, Mixtral, Nemotron",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    docsUrl: "https://build.nvidia.com",
    models: ["nvidia/llama-3.1-nemotron-70b", "meta/llama-3.1-405b-instruct", "mistralai/mixtral-8x22b"],
    free: true,
  },
  {
    id: "omnirouter",
    name: "OmniRouter",
    description: "Router inteligente multi-proveedor con failover automático",
    baseUrl: "https://api.omnirouter.ai/v1",
    docsUrl: "https://docs.omnirouter.ai",
    models: ["auto", "fast", "quality"],
  },
  {
    id: "9router",
    name: "9Router",
    description: "Enrutamiento de modelos con optimización de costos",
    baseUrl: "https://api.9router.ai/v1",
    docsUrl: "https://docs.9router.ai",
    models: ["auto-best", "auto-fast", "auto-cheap"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description: "Mistral Large, Medium, Small — modelos europeos de alto rendimiento",
    baseUrl: "https://api.mistral.ai/v1",
    docsUrl: "https://docs.mistral.ai",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Modelos con acceso a internet en tiempo real para búsqueda",
    baseUrl: "https://api.perplexity.ai",
    docsUrl: "https://docs.perplexity.ai",
    models: ["llama-3.1-sonar-huge-128k-online", "llama-3.1-sonar-large-128k-online"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-R1 — razonamiento avanzado",
    baseUrl: "https://api.deepseek.com/v1",
    docsUrl: "https://platform.deepseek.com/docs",
    models: ["deepseek-chat", "deepseek-reasoner"],
    free: true,
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "Command R+, Embed — optimizados para empresas y RAG",
    baseUrl: "https://api.cohere.ai/v1",
    docsUrl: "https://docs.cohere.com",
    models: ["command-r-plus", "command-r", "command-light"],
  },
  {
    id: "groq",
    name: "Groq",
    description: "Inferencia ultra-rápida en hardware LPU: Llama, Mixtral",
    baseUrl: "https://api.groq.com/openai/v1",
    docsUrl: "https://console.groq.com/docs",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
    free: true,
  },
  {
    id: "together",
    name: "Together AI",
    description: "Modelos open source a escala: Llama, CodeLlama, Qwen",
    baseUrl: "https://api.together.xyz/v1",
    docsUrl: "https://docs.together.ai",
    models: ["meta-llama/Llama-3.1-405B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    description: "Inferencia rápida de modelos open source con baja latencia",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    docsUrl: "https://docs.fireworks.ai",
    models: ["accounts/fireworks/models/llama-v3p1-405b-instruct", "accounts/fireworks/models/mixtral-8x22b-instruct"],
  },
];

/** Borrador editable por tarjeta (la API key nunca se re-muestra). */
type Draft = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

type SettingsResponse = {
  provider: string | null;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  hermesEndpoint: string;
  hasPin: boolean;
  presets: string[];
};

export default function AIProvidersPage() {
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const initial: Record<string, Draft> = {};
    for (const p of AI_PROVIDERS) {
      initial[p.id] = { apiKey: "", baseUrl: p.baseUrl, model: p.models[0] ?? "" };
    }
    return initial;
  });
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prueba de conexión (proveedor activo guardado)
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Hermes (agente externo) — guardado para planeación, sin conexión activa
  const [hermesEndpoint, setHermesEndpoint] = useState("");
  const [hermesPin, setHermesPin] = useState("");
  const [hermesSaved, setHermesSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SettingsResponse | null) => {
        if (!d) return;
        setActiveProvider(d.provider);
        setSelectedProvider(d.provider);
        setHasApiKey(d.hasApiKey);
        setHasPin(d.hasPin);
        setHermesEndpoint(d.hermesEndpoint ?? "");
        // Precarga modelo/baseUrl del proveedor activo desde la BD.
        setDrafts((prev) => {
          const next = { ...prev };
          if (d.provider && next[d.provider]) {
            next[d.provider] = {
              ...next[d.provider]!,
              model: d.model || next[d.provider]!.model,
              baseUrl: d.baseUrl || next[d.provider]!.baseUrl,
            };
          }
          return next;
        });
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  function updateDraft(providerId: string, field: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId]!, [field]: value },
    }));
  }

  /** Toggle radio-like: elegir una tarjeta la marca como activa (a guardar). */
  function chooseActive(providerId: string) {
    if (selectedProvider === providerId) return;
    setSelectedProvider(providerId);
    setExpandedId(providerId);
    setError(null);
  }

  /**
   * Espejo localStorage para las páginas preview (src/lib/ai-client.ts):
   * solo del proveedor activo. Si el input de key llegó vacío conservamos la
   * key previa del espejo (la real está cifrada en BD y no se re-muestra).
   */
  function mirrorToLocalStorage(providerId: string, draft: Draft) {
    if (typeof window === "undefined") return;
    try {
      let prevKey = "";
      try {
        const parsed = JSON.parse(localStorage.getItem("localrank_ai_providers") || "{}") as
          Record<string, { apiKey?: string }>;
        prevKey = parsed[providerId]?.apiKey ?? "";
      } catch {}
      const key = draft.apiKey.trim() || prevKey;
      if (key) localStorage.setItem("localrank_openrouter_key", key);
      localStorage.setItem(
        "localrank_ai_providers",
        JSON.stringify({
          [providerId]: { apiKey: key, baseUrl: draft.baseUrl, model: draft.model, enabled: true },
        })
      );
    } catch {}
  }

  async function handleSave(providerId: string) {
    setSavingId(providerId);
    setError(null);
    try {
      const draft = drafts[providerId]!;
      const payload: { provider: string; model: string; baseUrl: string; apiKey?: string } = {
        provider: providerId,
        model: draft.model.trim(),
        baseUrl: draft.baseUrl.trim(),
      };
      // Input vacío + key ya guardada ⇒ no enviar apiKey (se mantiene la
      // cifrada en BD). Con key nueva ⇒ se envía y se re-cifra en el server.
      const keyInput = draft.apiKey.trim();
      if (keyInput) payload.apiKey = keyInput;

      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as SettingsResponse & { error?: { message?: string } };
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo guardar la configuración de IA");
        setSavingId(null);
        return;
      }
      setActiveProvider(data.provider);
      setSelectedProvider(data.provider);
      setHasApiKey(data.hasApiKey);
      updateDraft(providerId, "apiKey", "");
      mirrorToLocalStorage(providerId, draft);
      setSaved(providerId);
      setSavingId(null);
      setTimeout(() => {
        setSaved(null);
        setExpandedId(null); // collapse after save
      }, 1200);
    } catch {
      setError("No se pudo guardar la configuración de IA");
      setSavingId(null);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "test" }),
      });
      const data = (await res.json()) as { ok: boolean; model?: string; sample?: string; detail?: string };
      if (data.ok) {
        const sample = (data.sample ?? "").slice(0, 60);
        setTestResult({ ok: true, text: `Conexión OK (${data.model ?? "?"}) — respondió: "${sample}"` });
      } else {
        setTestResult({ ok: false, text: (data.detail ?? "Sin detalle del error").slice(0, 240) });
      }
    } catch {
      setTestResult({ ok: false, text: "No se pudo contactar el servidor" });
    } finally {
      setTesting(false);
    }
  }

  async function saveHermes() {
    setSavingId("hermes");
    setError(null);
    try {
      const payload: { hermesEndpoint: string; hermesPin?: string } = {
        hermesEndpoint: hermesEndpoint.trim(),
      };
      // Igual semántica que la API key: input vacío + PIN guardado ⇒ no tocar.
      if (hermesPin.trim()) payload.hermesPin = hermesPin.trim();
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as SettingsResponse & { error?: { message?: string } };
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo guardar Hermes");
        setSavingId(null);
        return;
      }
      setHasPin(data.hasPin);
      setHermesPin("");
      setHermesSaved(true);
      setSavingId(null);
      setTimeout(() => {
        setHermesSaved(false);
      }, 1200);
    } catch {
      setError("No se pudo guardar Hermes");
      setSavingId(null);
    }
  }

  function toggleKeyVisibility(providerId: string) {
    setVisibleKeys((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  }

  const activeName =
    AI_PROVIDERS.find((p) => p.id === activeProvider)?.name ?? activeProvider;
  const keyAvailable = (id: string) =>
    (activeProvider === id && hasApiKey) || Boolean(drafts[id]?.apiKey.trim());

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Proveedores de IA</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige el proveedor activo para tu organización (API key cifrada en la base de
          datos). El CRM lo usará para el asistente, análisis y automatizaciones.
        </p>
        {/* Status summary */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando configuración…
            </span>
          ) : activeProvider ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              <Check className="h-3.5 w-3.5" />
              Activo: {activeName ?? activeProvider}
              {hasApiKey ? " · API key guardada" : " · sin API key"}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" /> Sin proveedor activo — elige uno y guarda
            </span>
          )}
          <button
            type="button"
            onClick={testConnection}
            disabled={testing || loading}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          {testResult && (
            <span
              className={`flex items-center gap-1.5 text-xs ${testResult.ok ? "text-green-600" : "text-red-600"}`}
            >
              {testResult.ok ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {testResult.text}
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {AI_PROVIDERS.map((provider) => {
          const draft = drafts[provider.id]!;
          const isActive = activeProvider === provider.id;
          const isSelected = selectedProvider === provider.id;
          const isVisible = visibleKeys[provider.id] ?? false;
          // Opciones del select: catálogo + modelo guardado si no está.
          const modelOptions = provider.models.includes(draft.model)
            ? provider.models
            : [draft.model, ...provider.models].filter(Boolean);

          return (
            <div
              key={provider.id}
              className={`rounded-lg border p-4 transition-colors ${
                isSelected ? "border-brand bg-brand-tint/30" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === provider.id ? null : provider.id)}
                >
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{provider.name}</h4>
                    {provider.free && (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Gratis
                      </span>
                    )}
                    {isSelected && keyAvailable(provider.id) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <Check className="h-3 w-3" /> {isActive ? "Activo" : "Por guardar"}
                      </span>
                    )}
                    {isSelected && !keyAvailable(provider.id) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <AlertCircle className="h-3 w-3" /> Sin API Key
                      </span>
                    )}
                    {isSelected && expandedId !== provider.id && (
                      <span className="text-xs text-muted-foreground">— click para editar</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{provider.description}</p>
                </div>
                <label
                  className="relative inline-flex cursor-pointer items-center"
                  title="Elegir como proveedor activo"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => chooseActive(provider.id)}
                    className="peer sr-only"
                  />
                  <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-brand/20" />
                </label>
              </div>

              {expandedId === provider.id && (
                <div className="mt-4 space-y-3">
                  {/* API Key */}
                  <div>
                    <label className="mb-1 block text-sm font-medium">API Key</label>
                    <div className="relative">
                      <input
                        type={isVisible ? "text" : "password"}
                        value={draft.apiKey}
                        onChange={(e) => updateDraft(provider.id, "apiKey", e.target.value)}
                        placeholder={
                          isActive && hasApiKey && !draft.apiKey
                            ? "••••• guardada"
                            : `sk-... o tu clave de ${provider.name}`
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(provider.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {isActive && hasApiKey && !draft.apiKey && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ya hay una clave guardada (cifrada). Déjalo vacío para conservarla o escribe una nueva para reemplazarla.
                      </p>
                    )}
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="mb-1 block text-sm font-medium">Base URL</label>
                    <input
                      type="url"
                      value={draft.baseUrl}
                      onChange={(e) => updateDraft(provider.id, "baseUrl", e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className="mb-1 block text-sm font-medium">Modelo</label>
                    <select
                      value={draft.model}
                      onChange={(e) => updateDraft(provider.id, "model", e.target.value)}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Modelo que usará el CRM con este proveedor.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleSave(provider.id)}
                      disabled={savingId !== null}
                      className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
                    >
                      {saved === provider.id
                        ? "✓ Guardado"
                        : savingId === provider.id
                          ? "Guardando…"
                          : "Guardar"}
                    </button>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand hover:underline"
                    >
                      Ver documentación →
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hermes — agente externo (planeación) */}
      <div className="rounded-lg border border-dashed border-brand/40 p-4">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">Hermes (tu agente externo)</h4>
          {hasPin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <Check className="h-3 w-3" /> PIN guardado
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Endpoint listo para cuando conectemos Orko/Hermes — hoy queda guardado sin
          conexión activa (planeación).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Endpoint</label>
            <input
              type="url"
              value={hermesEndpoint}
              onChange={(e) => setHermesEndpoint(e.target.value)}
              placeholder="https://hermes.tu-dominio.com/api"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">PIN</label>
            <input
              type="password"
              value={hermesPin}
              onChange={(e) => setHermesPin(e.target.value)}
              placeholder={hasPin && !hermesPin ? "PIN guardado" : "PIN del endpoint"}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={saveHermes}
            disabled={savingId !== null}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {hermesSaved ? "✓ Guardado" : savingId === "hermes" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-dashed p-4">
        <h4 className="font-medium">¿No encuentras tu proveedor?</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Cualquier proveedor compatible con la API de OpenAI (formato /v1/chat/completions)
          funciona. Simplemente elige “OpenRouter” o cualquier entrada, cambia la Base URL
          al endpoint de tu proveedor y guarda.
        </p>
      </div>
    </div>
  );
}
