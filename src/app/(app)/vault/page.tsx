"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CloudUpload,
  Film,
  Github,
  Globe,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  detectType,
  MAX_BOOKMARKS,
  parseBookmarksHtml,
  parseGithubRepo,
  type BookmarkImportado,
  type VaultType,
} from "@/lib/bookmarks";

/**
 * Bóveda de recursos: repos de GitHub, páginas y herramientas guardados en la
 * BD (antes era la demo de localStorage del preview). Para repos consulta la
 * API pública de GitHub (stars, última actividad, release) con "Revisar".
 */

type VaultItem = {
  id: string;
  type: VaultType;
  title: string;
  url: string;
  notes: string;
  tags: string[];
  githubMeta: {
    stars?: number;
    pushedAt?: string;
    latestRelease?: { tag: string; publishedAt: string } | null;
    lastChecked?: string;
  } | null;
  archived: boolean;
};

type Filtro = "todos" | VaultType;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "repo", label: "Repos" },
  { id: "pagina", label: "Páginas" },
  { id: "herramienta", label: "Herramientas" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaCorta(iso: string): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return `${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
}

export default function VaultPage() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<null | Partial<VaultItem>>(null);
  const [mensaje, setMensaje] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [importacion, setImportacion] = useState<null | BookmarkImportado[]>(null);
  const [dictado, setDictado] = useState(""); // texto libre del campo único
  const [entendiendo, setEntendiendo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);
  const [video, setVideo] = useState<null | {
    fase: "transcribiendo" | "listo";
    transcript?: string;
    resumen?: { title: string; notes: string; tags: string[] };
    repos?: { full_name: string; html_url: string; description: string; stars: number }[];
    error?: string;
  }>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    recargar();
    // Apaga el micrófono si el usuario sale de la pantalla dictando.
    return () => {
      try { recRef.current?.stop?.(); } catch {}
      try { recRef.current?.abort?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recargar(incluirArchivados = verArchivados) {
    fetch(`/api/vault${incluirArchivados ? "?includeArchived=true" : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => {})
      .finally(() => setCargando(false));
  }

  /** Alterna la lista entre activos y todo (con archivados para restaurar). */
  function alternarArchivados() {
    const next = !verArchivados;
    setVerArchivados(next);
    recargar(next);
  }

  function flash(texto: string) {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 4000);
  }

  const visibles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filtro !== "todos" && it.type !== filtro) return false;
      if (!qq) return true;
      return (
        it.title.toLowerCase().includes(qq) ||
        it.notes.toLowerCase().includes(qq) ||
        it.tags.some((t) => t.toLowerCase().includes(qq))
      );
    });
  }, [items, filtro, q]);

  async function guardar() {
    if (!editando?.title?.trim() || guardando) return;
    setGuardando(true);
    const esNuevo = !editando.id;
    const payload = {
      title: editando.title,
      url: editando.url ?? "",
      notes: editando.notes ?? "",
      type: editando.type ?? (editando.url ? detectType(editando.url) : "pagina"),
      tags: editando.tags ?? [],
    };
    const res = await fetch("/api/vault", {
      method: esNuevo ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(esNuevo ? payload : { ...payload, id: editando.id }),
    }).catch(() => null);
    setGuardando(false);
    if (res?.ok) {
      flash(esNuevo ? "Guardado en tus recursos ✅" : "Actualizado ✅");
      setEditando(null);
      recargar();
    } else {
      flash("No se pudo guardar");
    }
  }

  async function alternarArchivado(it: VaultItem) {
    await fetch("/api/vault", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, archived: !it.archived }),
    }).catch(() => null);
    recargar();
  }

  async function eliminar(it: VaultItem) {
    if (!window.confirm(`¿Eliminar «${it.title}» de tus recursos?`)) return;
    const res = await fetch(`/api/vault?id=${encodeURIComponent(it.id)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (res?.ok) setItems((prev) => prev.filter((x) => x.id !== it.id));
  }

  /** Video → Whisper (GROQ) → resumen IA + repos sugeridos de GitHub. */
  async function subirVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVideo({ fase: "transcribiendo" });
    const fd = new FormData();
    fd.append("file", file);
    const t = await fetch("/api/vault/transcribe", { method: "POST", body: fd })
      .then(async (r) => (r.ok ? await r.json() : { error: (await r.json().catch(() => ({}))).error?.message ?? "Falló la transcripción" }))
      .catch(() => ({ error: "Falló la subida" }));
    if (t.error || !t.transcript) {
      setVideo({ fase: "listo", error: t.error ?? "No se entendió el audio" });
      return;
    }
    // Resumen con la misma IA del recurso + keywords para GitHub
    const parse = await fetch("/api/vault/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Resumen del siguiente video (título corto, para qué sirve, 2-3 etiquetas de temas técnicos):\n${t.transcript.slice(0, 3000)}`,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const resumen = parse?.resource ?? null;

    // Búsqueda de repos con las etiquetas/temas
    let repos: { full_name: string; html_url: string; description: string; stars: number }[] = [];
    const q = resumen?.tags?.length ? resumen.tags.slice(0, 2).join(" ") : (resumen?.title ?? "").slice(0, 40);
    if (q.trim()) {
      const gh = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=4`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "DuqueLabs-CRM" } }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      repos = (gh?.items ?? []).map((r: { full_name: string; html_url: string; description: string | null; stargazers_count: number }) => ({
        full_name: r.full_name,
        html_url: r.html_url,
        description: r.description ?? "",
        stars: r.stargazers_count,
      }));
    }
    setVideo({ fase: "listo", transcript: t.transcript, resumen, repos });
  }

  /** Guarda un repo sugerido directamente en la bóveda. */
  async function guardarRepoSugerido(r: { full_name: string; html_url: string; description: string }) {
    const ok = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: r.full_name, url: r.html_url, notes: r.description || "Encontrado por el análisis del video", tags: video?.resumen?.tags ?? [] }),
    })
      .then((x) => x.ok)
      .catch(() => false);
    if (ok) {
      flash(`Repo guardado: ${r.full_name} ⭐`);
      recargar();
    }
  }

  /** Guarda el resumen del video como recurso. */
  async function guardarResumenVideo() {
    if (!video?.resumen) return;
    const ok = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: video.resumen.title,
        url: "",
        notes: `${video.resumen.notes}\n\nTranscripción:\n${(video.transcript ?? "").slice(0, 1500)}`,
        tags: video.resumen.tags,
      }),
    })
      .then((x) => x.ok)
      .catch(() => false);
    if (ok) {
      setVideo(null);
      flash("Video guardado en Recursos con su transcripción 🎥");
      recargar();
    }
  }

  async function revisar(solo?: string[]) {
    setRevisando(true);
    const res = await fetch("/api/vault/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(solo ? { ids: solo } : {}),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setRevisando(false);
    if (res && res.checked > 0) {
      const conRelease = (res.updated as { latestRelease?: unknown }[]).filter(
        (u) => u.latestRelease
      ).length;
      flash(`GitHub revisado: ${res.checked} repo(s)${conRelease ? ` · ${conRelease} con release` : ""}`);
    } else {
      flash("Nada que revisar (o GitHub no respondió)");
    }
    recargar();
  }

  /** Dictado por voz (Web Speech API, es-CO): suma lo oído al campo único. */
  function alternarMic() {
    if (grabando) {
      recRef.current?.stop();
      setGrabando(false);
      return;
    }
    const W = window as unknown as {
      SpeechRecognition?: new () => Record<string, unknown>;
      webkitSpeechRecognition?: new () => Record<string, unknown>;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      flash("Tu navegador no soporta dictado — escríbelo y la IA igual lo organiza");
      return;
    }
    // Tipado mínimo del reconocimiento de voz (el repo usa window as any aquí)
    type SR = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const rec = new Ctor() as unknown as SR;
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let texto = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i]!.isFinal) texto += e.results[i]![0].transcript;
      }
      if (texto) setDictado((prev) => (prev ? `${prev} ${texto.trim()}` : texto.trim()));
    };
    rec.onend = () => setGrabando(false);
    rec.onerror = () => setGrabando(false);
    // Mata instancias previas (el 2.º uso falla si quedan vivas)
    try { recRef.current?.stop?.(); } catch {}
    try { recRef.current?.abort?.(); } catch {}
    recRef.current = rec;
    try {
      rec.start();
      setGrabando(true);
    } catch {
      setGrabando(false);
    }
  }

  /** La IA entiende el texto libre y guarda el recurso. */
  async function entenderYGuardar() {
    if (dictado.trim().length < 3) return;
    setEntendiendo(true);
    const res = await fetch("/api/vault/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: dictado }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (!res?.ok || !res.resource?.title) {
      setEntendiendo(false);
      flash("No pude entenderlo — prueba de nuevo o usa el formulario");
      return;
    }
    const r = res.resource as { title: string; url: string; notes: string; tags: string[] };
    const post = await fetch("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: r.title,
        url: r.url,
        notes: r.notes,
        tags: r.tags ?? [],
      }),
    })
      .then((x) => x.ok)
      .catch(() => false);
    setEntendiendo(false);
    if (post) {
      setDictado("");
      flash(
        res.source === "ai"
          ? `Guardado ✨ «${r.title}»${r.url ? " + link" : ""}${r.tags?.length ? ` · ${r.tags.map((t) => `#${t}`).join(" ")}` : ""}`
          : `Guardado (sin IA) «${r.title}»`
      );
      recargar();
    } else {
      flash("No se pudo guardar");
    }
  }

  async function importarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const html = await file.text().catch(() => "");
    const marks = parseBookmarksHtml(html).slice(0, MAX_BOOKMARKS);
    if (marks.length === 0) {
      flash("No encontré favoritos en ese archivo (exporta desde Chrome: Marcadores → Administrador → Exportar)");
      return;
    }
    setImportacion(marks);
  }

  const porCarpeta = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of importacion ?? []) {
      const k = m.folder || "Sin carpeta";
      mapa.set(k, (mapa.get(k) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [importacion]);

  async function confirmarImportacion() {
    if (!importacion) return;
    const existentes = new Set(items.map((i) => i.url).filter(Boolean));
    const nuevos = importacion.filter((m) => !existentes.has(m.url)).slice(0, 300);
    let ok = 0;
    for (const m of nuevos) {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (m.title || m.url).slice(0, 200),
          url: m.url,
          notes: m.folder ? `Importado de Chrome: ${m.folder}` : "Importado de Chrome",
          tags: m.folder ? [m.folder.slice(0, 30)] : [],
        }),
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (res) ok++;
    }
    setImportacion(null);
    flash(`${ok} favorito(s) importados a Recursos 📥`);
    recargar();
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-4 pb-28 md:p-6 md:pb-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold md:text-xl">Recursos</h2>
            <p className="text-xs text-muted-foreground md:text-sm">
              Tus repos, páginas, herramientas y videos — todo en un lugar
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".html"
              className="hidden"
              onChange={importarArchivo}
            />
            <input
              ref={videoRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              onChange={subirVideo}
            />
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold shadow-sm transition-transform active:scale-[0.97] md:text-sm dark:bg-gray-900"
            >
              <Film className="h-4 w-4" /> Video → IA
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold shadow-sm transition-transform active:scale-[0.97] md:text-sm dark:bg-gray-900"
            >
              <CloudUpload className="h-4 w-4" /> Importar Chrome
            </button>
            <button
              type="button"
              onClick={() => setEditando({ type: "pagina", tags: [] })}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white shadow-sm transition-transform active:scale-[0.97] md:text-sm"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Agregar
            </button>
          </div>
        </div>

        {mensaje && (
          <div className="rounded-xl border border-brand/30 bg-brand-tint/40 px-3 py-2 text-xs font-medium md:text-sm">
            {mensaje}
          </div>
        )}

        {/* Panel del video: transcripción → resumen → repos sugeridos */}
        {video && (
          <div className="space-y-3 rounded-2xl border border-brand/30 bg-white p-4 shadow-sm dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold">
                <Film className="h-4 w-4 text-brand" /> Análisis del video
              </h3>
              <button type="button" onClick={() => setVideo(null)} aria-label="Cerrar">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {video.fase === "transcribiendo" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Escuchando el video con Whisper…
              </p>
            )}

            {video.error && <p className="text-sm font-medium text-[#c03a2e]">⚠️ {video.error}</p>}

            {video.fase === "listo" && video.resumen && (
              <>
                <div className="rounded-xl bg-brand-tint/40 p-3">
                  <b className="text-sm">{video.resumen.title}</b>
                  <p className="mt-1 text-xs text-muted-foreground">{video.resumen.notes}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {video.resumen.tags.map((t) => (
                      <span key={t} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-brand">#{t}</span>
                    ))}
                  </div>
                </div>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold">Ver transcripción</summary>
                  <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap">{video.transcript}</p>
                </details>
                {video.repos && video.repos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold">Repos que encajan con el tema:</p>
                    <div className="space-y-1.5">
                      {video.repos.map((r) => (
                        <div key={r.full_name} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <b className="block truncate text-xs">{r.full_name}</b>
                            <small className="block truncate text-[11px] text-muted-foreground">⭐ {r.stars} · {r.description}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => guardarRepoSugerido(r)}
                            className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white active:scale-95"
                          >
                            Guardar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={guardarResumenVideo}
                  className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white"
                >
                  Guardar el video en la bóveda 🎥
                </button>
              </>
            )}
          </div>
        )}

        {/* Filtros + búsqueda */}
        <div className="flex flex-wrap items-start gap-2 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filtro === f.id
                    ? "bg-brand text-white"
                    : "border bg-white text-muted-foreground dark:bg-gray-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 md:ml-auto md:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en la bóveda…"
              className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm focus:border-brand focus:outline-none dark:bg-gray-900"
            />
          </div>
          <button
            type="button"
            onClick={alternarArchivados}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              verArchivados
                ? "bg-brand text-white"
                : "border bg-white text-muted-foreground dark:bg-gray-900"
            }`}
          >
            {verArchivados ? "Ver archivados: sí" : "Ver archivados"}
          </button>
        </div>

        {/* Revisar actualizaciones (repos) */}
        {items.some((i) => i.type === "repo") && (
          <button
            type="button"
            onClick={() => revisar()}
            disabled={revisando}
            className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white py-2.5 text-sm font-semibold shadow-sm disabled:opacity-50 dark:bg-gray-900"
          >
            <RefreshCw className={`h-4 w-4 ${revisando ? "animate-spin" : ""}`} />
            {revisando ? "Preguntando a GitHub…" : "Revisar actualizaciones de mis repos"}
          </button>
        )}

        {/* Formulario agregar/editar */}
        {editando && (
          <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editando.id ? "Editar" : "Nuevo recurso"}</h3>
              <button type="button" onClick={() => setEditando(null)} aria-label="Cerrar">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Campo único con dictado: cuéntalo y la IA lo organiza */}
            {!editando.id && (
              <div className="rounded-2xl border border-brand/25 bg-brand-tint/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand">
                  <Sparkles className="h-3.5 w-3.5" />
                  Cuéntamelo o díctalo — la IA llena todo
                </p>
                <div className="flex items-end gap-2">
                  <textarea
                    value={dictado}
                    onChange={(e) => setDictado(e.target.value)}
                    rows={2}
                    placeholder='Ej: "guarda github.com/duque/herramienta, sirve para desplegar, etiqueta dev"'
                    className="min-h-[56px] flex-1 resize-none rounded-xl border bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none dark:bg-gray-800"
                  />
                  <button
                    type="button"
                    onClick={alternarMic}
                    aria-label={grabando ? "Detener dictado" : "Dictar por voz"}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all ${
                      grabando
                        ? "animate-pulse bg-red-500 text-white"
                        : "bg-brand text-white active:scale-95"
                    }`}
                  >
                    {grabando ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={entenderYGuardar}
                    disabled={entendiendo || dictado.trim().length < 3}
                    className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {entendiendo ? "Entendiendo…" : "Entender y guardar ✨"}
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {grabando ? "Escuchando… habla nomás" : "o llena el formulario de abajo"}
                  </span>
                </div>
              </div>
            )}

            <input
              value={editando.url ?? ""}
              onChange={(e) =>
                setEditando((p) => ({
                  ...p,
                  url: e.target.value,
                  type: detectType(e.target.value),
                }))
              }
              placeholder="https://github.com/usuario/repo"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <input
              value={editando.title ?? ""}
              onChange={(e) => setEditando((p) => ({ ...p, title: e.target.value }))}
              placeholder="¿Qué es? (título)"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <textarea
              value={editando.notes ?? ""}
              onChange={(e) => setEditando((p) => ({ ...p, notes: e.target.value }))}
              placeholder="¿Para qué te sirve?"
              rows={2}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <input
              value={(editando.tags ?? []).join(", ")}
              onChange={(e) =>
                setEditando((p) => ({
                  ...p,
                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
                }))
              }
              placeholder="Etiquetas separadas por coma"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <div className="flex gap-1.5">
              {(["repo", "pagina", "herramienta"] as VaultType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEditando((p) => ({ ...p, type: t }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    (editando.type ?? "pagina") === t
                      ? "bg-brand text-white"
                      : "border bg-white text-muted-foreground dark:bg-gray-900"
                  }`}
                >
                  {t === "repo" ? "Repo" : t === "pagina" ? "Página" : "Herramienta"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar en la bóveda"}
            </button>
          </div>
        )}

        {/* Vista previa de importación */}
        {importacion && (
          <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900">
            <h3 className="font-semibold">Importar {importacion.length} favorito(s) de Chrome</h3>
            <div className="flex flex-wrap gap-1.5">
              {porCarpeta.slice(0, 12).map(([carpeta, n]) => (
                <span
                  key={carpeta}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {carpeta} · {n}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cada carpeta se convierte en etiqueta. Se saltan los que ya están en la bóveda.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmarImportacion}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white"
              >
                Importar
              </button>
              <button
                type="button"
                onClick={() => setImportacion(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        {cargando ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="font-medium">Tus recursos están vacíos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Guarda tu primer repo, sube un video o importa tus favoritos de Chrome
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {visibles.map((it) => (
              <div
                key={it.id}
                className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900 ${
                  it.archived ? "opacity-50" : ""
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                    {it.type === "repo" ? (
                      <Github className="h-5 w-5" />
                    ) : it.type === "herramienta" ? (
                      <Wrench className="h-5 w-5" />
                    ) : (
                      <Globe className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">{it.title}</b>
                    {it.url && (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block break-all text-xs text-brand hover:underline"
                      >
                        {it.url}
                      </a>
                    )}
                    {it.notes && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.notes}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {typeof it.githubMeta?.stars === "number" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs">
                          <Star className="h-3 w-3" /> {it.githubMeta.stars}
                        </span>
                      )}
                      {it.githubMeta?.pushedAt && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          act. {fechaCorta(it.githubMeta.pushedAt)}
                        </span>
                      )}
                      {it.githubMeta?.latestRelease?.tag && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          {it.githubMeta.latestRelease.tag}
                        </span>
                      )}
                      {it.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2.5">
                  {it.type === "repo" && parseGithubRepo(it.url) && (
                    <button
                      type="button"
                      onClick={() => revisar([it.id])}
                      disabled={revisando}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-tint disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Revisar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditando(it)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarArchivado(it)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    {it.archived ? <><Check className="h-3.5 w-3.5" /> Restaurar</> : "Archivar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminar(it)}
                    className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
