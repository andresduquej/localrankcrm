"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Plus, Sparkles, Trash2 } from "lucide-react";

/**
 * Tareas — tu lista real del mayordomo (BD vía /api/tasks), centrada y
 * premium: filtros claros con conteo, alta rápida por texto o dictado con
 * IA, check/tachado animado y vencidas en rojo. Cero demo, cero localStorage.
 */

type Tarea = {
  id: string;
  title: string;
  priority: string;
  dueDate: string;
};

type Filtro = "todas" | "hoy" | "vencidas" | "alta";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function fechaCorta(iso: string): { texto: string; vencida: boolean; esHoy: boolean } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { texto: "sin fecha", vencida: false, esHoy: false };
  const wall = new Date(d.getTime() - 5 * 3600_000);
  const hoyWall = new Date(Date.now() - 5 * 3600_000);
  const esHoy = wall.toISOString().slice(0, 10) === hoyWall.toISOString().slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    texto: `${DIAS[wall.getUTCDay()]} ${wall.getUTCDate()} ${MESES[wall.getUTCMonth()]}, ${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}`,
    vencida: d.getTime() < Date.now(),
    esHoy,
  };
}

const PRIORIDAD = {
  high: { label: "🔥 Alta", cls: "bg-[#ff3b30]/10 text-[#c03a2e]" },
  medium: { label: "⚡ Media", cls: "bg-[#ff9f0a]/10 text-[#c25e00]" },
  low: { label: "🌿 Baja", cls: "bg-brand-tint text-brand" },
} as const;

export default function TasksPage() {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const [creando, setCreando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [feedback, setFeedback] = useState("");
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  function cargar() {
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTareas(Array.isArray(d?.tasks) ? d.tasks : []))
      .catch(() => {});
  }

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 3500);
  }

  const ahora = Date.now();
  const hoyKey = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const conteo = {
    todas: tareas.length,
    hoy: tareas.filter((t) => t.dueDate?.slice(0, 10) === hoyKey).length,
    vencidas: tareas.filter(
      (t) => t.dueDate && !Number.isNaN(new Date(t.dueDate).getTime()) && new Date(t.dueDate).getTime() < ahora
    ).length,
    alta: tareas.filter((t) => t.priority === "high").length,
  };

  const visibles = tareas.filter((t) => {
    if (filtro === "hoy") return t.dueDate?.slice(0, 10) === hoyKey;
    if (filtro === "vencidas")
      return t.dueDate && !Number.isNaN(new Date(t.dueDate).getTime()) && new Date(t.dueDate).getTime() < ahora;
    if (filtro === "alta") return t.priority === "high";
    return true;
  });

  async function crear(rapida = false) {
    const fuente = rapida ? texto.trim() : texto.trim();
    if (fuente.length < 2) return;
    setCreando(true);
    const res = await fetch(rapida ? "/api/tasks" : "/api/tasks/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        rapida ? { title: fuente, priority: "medium" } : { text: fuente }
      ),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setCreando(false);
    if (res?.ok) {
      setTexto("");
      flash(rapida ? "Tarea creada ✅" : "Tarea entendida y creada ✨");
      cargar();
    } else {
      flash("No se pudo crear la tarea");
    }
  }

  async function marcarHecha(id: string) {
    setTareas((prev) => prev.filter((t) => t.id !== id));
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done: true }),
    }).catch(() => {});
  }

  async function eliminar(id: string) {
    setTareas((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

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
      flash("Tu navegador no soporta dictado — escríbelo y usa Entender ✨");
      return;
    }
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
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i]!.isFinal) t += e.results[i]![0].transcript;
      }
      if (t) setTexto((prev) => (prev ? `${prev} ${t.trim()}` : t.trim()));
    };
    rec.onend = () => setGrabando(false);
    rec.onerror = () => setGrabando(false);
    recRef.current = rec;
    rec.start();
    setGrabando(true);
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-52 md:p-6 md:pb-32">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Cabecera */}
        <div className="text-center md:text-left">
          <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">Tareas</h2>
          <p className="text-xs text-muted-foreground md:text-sm">
            {tareas.length === 0
              ? "Vacía la cabeza aquí — crea la primera abajo"
              : `${conteo.vencidas > 0 ? `⚠️ ${conteo.vencidas} vencida${conteo.vencidas > 1 ? "s" : ""} · ` : ""}${tareas.length} pendientes`}
          </p>
        </div>

        {feedback && (
          <div className="rounded-xl border border-brand/30 bg-brand-tint/40 px-3 py-2 text-center text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* Filtros con conteo legible */}
        <div className="flex flex-wrap justify-center gap-2 md:justify-start">
          {(
            [
              ["todas", "Todas"],
              ["hoy", "Hoy"],
              ["vencidas", "Vencidas"],
              ["alta", "🔥 Alta"],
            ] as [Filtro, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-all active:scale-95 ${
                filtro === id
                  ? "bg-brand text-white shadow-sm"
                  : "border bg-white text-muted-foreground dark:bg-gray-900"
              }`}
            >
              {label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  filtro === id ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {conteo[id]}
              </span>
            </button>
          ))}
        </div>

        {/* Lista: tarjetas a ancho completo, bien respiradas */}
        {visibles.length === 0 ? (
          <div className="rounded-[24px] border border-dashed p-10 text-center">
            <p className="font-semibold">
              {filtro === "todas" ? "Sin tareas pendientes" : "Nada por aquí con este filtro"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea una abajo o háblale al bot: <b>/tarea llamar a Juan mañana 30 min</b>
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibles.map((t) => {
              const f = t.dueDate ? fechaCorta(t.dueDate) : null;
              const pri = PRIORIDAD[(t.priority as keyof typeof PRIORIDAD) ?? "medium"] ?? PRIORIDAD.medium;
              return (
                <div
                  key={t.id}
                  className={`group flex items-center gap-3 rounded-[22px] border bg-white p-3.5 shadow-sm transition-all active:scale-[0.98] dark:bg-gray-900 ${
                    f?.vencida ? "border-[#ff3b30]/30" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => marcarHecha(t.id)}
                    aria-label="Marcar hecha"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-all active:scale-90 ${
                      f?.vencida
                        ? "border-[#ff3b30] bg-[#ff3b30]/10 text-[#ff3b30]"
                        : "border-gray-300 text-transparent hover:border-brand"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="min-w-0 flex-1">
                    <b className={`block text-[15px] font-semibold leading-snug ${f?.vencida ? "text-[#c03a2e]" : ""}`}>
                      {t.title}
                    </b>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${pri.cls}`}>{pri.label}</span>
                      {f && (
                        <span
                          className={`text-[11px] font-medium ${
                            f.vencida ? "font-bold text-[#ff3b30]" : f.esHoy ? "font-bold text-brand" : "text-muted-foreground"
                          }`}
                        >
                          {f.vencida ? "⚠️ vencida · " : f.esHoy ? "★ hoy · " : "📅 "}
                          {f.texto}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminar(t.id)}
                    aria-label="Eliminar tarea"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-red-50 hover:text-[#ff3b30] active:scale-90"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra fija de alta: lista arriba, escribir/dictar abajo (estilo chat) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/90 px-4 py-2.5 backdrop-blur md:bottom-0 md:left-[256px] dark:border-white/10 dark:bg-gray-900/90" style={{ paddingBottom: "calc(10px + var(--safe-bottom))" }}>
        <div className="mx-auto max-w-2xl">
          <div className="mb-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => crear(false)}
              disabled={creando || texto.trim().length < 3}
              className="flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-white disabled:opacity-40 active:scale-95"
            >
              <Sparkles className="h-3 w-3" /> Entender y crear
            </button>
            <button
              type="button"
              onClick={() => crear(true)}
              disabled={creando || texto.trim().length < 2}
              className="rounded-full border px-3 py-1 text-[11px] font-semibold disabled:opacity-40 active:scale-95"
            >
              + Rápida
            </button>
            {grabando && <span className="text-[11px] font-bold text-[#ff3b30]">🎙 Escuchando…</span>}
            {creando && <span className="text-[11px] text-muted-foreground">Creando…</span>}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crear(true);
              }}
              placeholder='"llamar a Juan mañana 3pm urgente"'
              className="min-h-[46px] flex-1 rounded-full border bg-background px-4 text-[15px] focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={alternarMic}
              aria-label={grabando ? "Detener dictado" : "Dictar"}
              className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                grabando ? "animate-pulse bg-[#ff3b30] text-white" : "text-muted-foreground hover:bg-muted hover:text-brand"
              }`}
            >
              {grabando ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


