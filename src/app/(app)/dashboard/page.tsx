"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Database,
  FileText,
  Github,
  Globe,
  Instagram,
  Link2,
  Wrench,
} from "lucide-react";

/**
 * Hoy — tu día real: KPIs vivos (citas, tareas, contactos, mensajes),
 * agenda y tareas del mayordomo, recursos y proveedores.
 * Todo llega en UNA petición (/api/overview); los conteos los hace la BD.
 * Cero datos demo: si la petición falla (p. ej. preview) quedan las citas
 * de cortesía.
 */

type VaultLight = { id: string; type: string; title: string; url: string };

type SupplierLight = {
  id: string;
  type: string;
  title: string;
  url: string;
  rating: number;
  tags: string[];
};

type Cita = {
  title: string;
  startsAt: string;
  notes?: string;
};

type Tarea = {
  id: string;
  title: string;
  priority: string;
  dueDate: string;
};

const TIPO_ICONO: Record<string, typeof Globe> = {
  repo: Github,
  pagina: Globe,
  resumen: FileText,
  instagram: Instagram,
  otro: Link2,
};

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Formatea una fecha en hora de Colombia (UTC-5 fijo, sin DST). */
function bogota(d: Date): { dia: number; mesCorto: string; mesLargo: string; hora: string; diaSemana: string } {
  const wall = new Date(d.getTime() - 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    dia: wall.getUTCDate(),
    mesCorto: MESES_CORTOS[wall.getUTCMonth()]!,
    mesLargo: MESES_LARGOS[wall.getUTCMonth()]!,
    hora: `${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}`,
    diaSemana: DIAS_SEMANA[wall.getUTCDay()]!,
  };
}

function esHoyBogota(iso: string): boolean {
  const a = bogota(new Date(iso));
  const b = bogota(new Date());
  return a.dia === b.dia && a.mesCorto === b.mesCorto;
}

/** Línea pequeña de la tarea: prioridad + fecha corta (o "sin fecha"). */
function tareaMeta(t: Tarea): string {
  const prioridad = t.priority === "high" ? "🔥 Alta" : t.priority === "low" ? "🌿 Baja" : "⚡ Media";
  if (!t.dueDate) return prioridad;
  const f = bogota(new Date(t.dueDate));
  return `${prioridad} · ${f.dia} ${f.mesCorto}, ${f.hora}`;
}

export default function DashboardPage() {
  const pathname = usePathname();
  const prefix = pathname.startsWith("/preview") ? "/preview" : "";
  const [nombre, setNombre] = useState("Andres");
  const [citas, setCitas] = useState<Cita[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [nContactos, setNContactos] = useState<number | null>(null);
  const [sinLeer, setSinLeer] = useState<number | null>(null);
  const [boveda, setBoveda] = useState<VaultLight[]>([]);
  const [proveedores, setProveedores] = useState<SupplierLight[]>([]);
  const [nProveedores, setNProveedores] = useState<number | null>(null);
  const [urlRapida, setUrlRapida] = useState("");
  const [guardandoUrl, setGuardandoUrl] = useState(false);
  const [avisoUrl, setAvisoUrl] = useState("");

  async function alternarTarea(id: string, done: boolean) {
    // Optimista: quita la fila; si el servidor falla, la repone tal cual.
    const copia = tareas.find((t) => t.id === id);
    setTareas((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done }),
    }).catch(() => null);
    if (!res?.ok && copia) {
      setTareas((prev) => [...prev, copia]);
    }
  }

  useEffect(() => {
    // Citas de cortesía SOLO en el preview/demo: en la app real el Hoy es
    // 100% datos de la BD — si no hay citas, se muestra el estado vacío.
    if (window.location.pathname.startsWith("/preview")) {
      const base = new Date();
      const mk = (h: number, title: string, notes: string): Cita => {
        const d = new Date(base);
        d.setHours(h, 0, 0, 0);
        return { title, startsAt: d.toISOString(), notes };
      };
      setCitas([mk(11, "Reunión con Juan Pérez", "Propuesta · Cafe Velázquez"), mk(15, "Llamada de seguimiento", "María Gómez · Dental Sonrisa")]);
    }

    // TODO el dashboard en una sola petición
    fetch("/api/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (typeof d.nombre === "string" && d.nombre.trim()) setNombre(d.nombre);
        if (Array.isArray(d.citas) && d.citas.length > 0) setCitas(d.citas);
        if (Array.isArray(d.tareas)) setTareas(d.tareas);
        setNContactos(typeof d.nContactos === "number" ? d.nContactos : 0);
        setSinLeer(typeof d.sinLeer === "number" ? d.sinLeer : 0);
        setBoveda(Array.isArray(d.recursos) ? d.recursos : []);
        setProveedores(Array.isArray(d.proveedores) ? d.proveedores : []);
        setNProveedores(typeof d.nProveedores === "number" ? d.nProveedores : 0);
      })
      .catch(() => {
        setNContactos(0);
        setSinLeer(0);
      });
  }, []);

  /** Pega una URL y queda guardada como proveedor (Enter o botón). */
  async function agregarUrlRapida() {
    const bruto = urlRapida.trim();
    if (!bruto) return;
    // Acepta cualquier dato: link, número, nombre… (la IA lo organiza)
    const esUrl = /^https?:\/\/\S+/i.test(bruto) || /^[a-z0-9-]+\.[a-z]{2,}(\/\S*)?$/i.test(bruto);
    const body = esUrl
      ? { url: bruto.startsWith("http") ? bruto : `https://${bruto}` }
      : { title: bruto.slice(0, 200) };
    setGuardandoUrl(true);
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setGuardandoUrl(false);
    if (res?.item) {
      setProveedores([res.item]);
      setNProveedores((n) => (n ?? 0) + 1);
      setUrlRapida("");
      setAvisoUrl("Guardado ✅");
      setTimeout(() => setAvisoUrl(""), 3000);
    } else {
      setAvisoUrl("No se pudo guardar — intenta de nuevo");
      setTimeout(() => setAvisoUrl(""), 4000);
    }
  }

  const proximas = [...citas].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const citasHoy = proximas.filter((c) => esHoyBogota(c.startsAt)).length;
  const hoy = bogota(new Date());
  const ahora = Date.now();
  const vencidas = tareas.filter(
    (t) => t.dueDate && !Number.isNaN(new Date(t.dueDate).getTime()) && new Date(t.dueDate).getTime() < ahora
  ).length;
  const hoyKey = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const pendientesHoy = tareas.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === hoyKey).length;
  const alDia = tareas.length > 0 ? Math.round(((tareas.length - vencidas) / tareas.length) * 100) : 100;

  /** Tareas con fecha por día, próximos 7 días (hoy incluido), hora Bogotá.
   *  Se calcula sobre TODAS las tareas que manda /api/overview (hasta 50). */
  const semana = useMemo(() => {
    const dias: { label: string; n: number; esHoy: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = new Date(Date.now() - 5 * 3600_000 + i * 86_400_000).toISOString().slice(0, 10);
      dias.push({
        label: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][
          new Date(Date.now() - 5 * 3600_000 + i * 86_400_000).getUTCDay()
        ]!,
        n: tareas.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === key).length,
        esHoy: i === 0,
      });
    }
    return dias;
  }, [tareas]);
  const maxSemana = Math.max(1, ...semana.map((d) => d.n));

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Saludo personal */}
        <div className="mb-5 md:mb-6">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight md:text-3xl">
            {saludo()}, {nombre} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="capitalize">{hoy.diaSemana}</span>, {hoy.dia} de {hoy.mesLargo}
            {citasHoy > 0 && (
              <>
                {" "}· <span className="font-semibold text-brand">{citasHoy} {citasHoy === 1 ? "cita" : "citas"} hoy</span>
              </>
            )}
          </p>
        </div>

        {/* ── ANILLO DEL DÍA (firma): tu carga de un vistazo, toca y va ── */}
        <Link
          href={`${prefix}/tasks`}
          className="group mb-4 block active:scale-[0.985] transition-transform md:mb-5"
        >
          <div
            className="relative overflow-hidden rounded-[28px] p-5 text-white shadow-lg md:p-6"
            style={{ background: "linear-gradient(135deg,#0a6cff 0%,#0856cc 55%,#053680 100%)" }}
          >
            {/* brillo glass superior */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-white/10 blur-2xl" />
            <div className="relative flex items-center gap-5">
              {/* Anillo: % de pendientes al día */}
              <div className="relative h-[104px] w-[104px] shrink-0">
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={vencidas > 0 ? "#ffd60a" : "#34c759"}
                    strokeWidth="12" strokeLinecap="round"
                    strokeDasharray={`${(alDia / 100) * 314} 314`}
                    className="transition-[stroke-dasharray] duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <b className="text-[30px] font-extrabold leading-none tracking-tight">{pendientesHoy}</b>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">hoy</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-white/70">Tu día</p>
                <p className="mt-0.5 text-[17px] font-bold leading-snug">
                  {tareas.length === 0
                    ? "Nada pendiente — cabeza vacía 🧠"
                    : vencidas > 0
                      ? `${vencidas} vencida${vencidas > 1 ? "s" : ""} te está esperando 😠`
                      : pendientesHoy > 0
                        ? `${pendientesHoy} por hacer hoy, vas al día ✅`
                        : `Hoy libre — ${tareas.length} para después 🌤`}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                    📅 {citasHoy} cita{citasHoy === 1 ? "" : "s"} hoy
                  </span>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                    ✅ {tareas.length} pendientes
                  </span>
                  {vencidas > 0 && (
                    <span className="rounded-full bg-[#ff3b30] px-2.5 py-1 text-[11px] font-bold">
                      ⚠️ {vencidas} vencida{vencidas > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>

        {/* ── Accesos: solo el ícono con su conteo ── */}
        <div className="mb-4 flex items-start justify-between px-1 md:mb-5 md:justify-start md:gap-8 md:px-6">
          {[
            { href: "/calendar", n: citasHoy, label: "Citas hoy", emoji: "📅", tint: "bg-[#ff9f0a]/15 text-[16px]" },
            { href: "/contacts", n: nContactos, label: "Contactos", emoji: "👤", tint: "bg-[#5856d6]/15 text-[16px]" },
            { href: "/inbox", n: sinLeer, label: "Sin leer", emoji: "💬", tint: "bg-[#30b0c7]/15 text-[16px]" },
            { href: "/vault", n: boveda.length, label: "Recursos", emoji: "🗂", tint: "bg-brand-tint text-[16px]" },
            { href: "/suppliers", n: nProveedores, label: "Proveedores", emoji: "🏢", tint: "bg-[#34c759]/15 text-[16px]" },
          ].map((acceso) => (
            <Link
              key={acceso.href}
              href={`${prefix}${acceso.href}`}
              className="flex w-16 flex-col items-center gap-1.5 transition-transform active:scale-90"
            >
              <span className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-full ${acceso.tint}`}>
                {acceso.emoji}
                {acceso.n !== null && acceso.n > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[10px] font-extrabold text-white shadow-sm">
                    {acceso.n > 99 ? "99+" : acceso.n}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground">{acceso.label}</span>
            </Link>
          ))}
        </div>

        {/* ── Proveedores: acceso directo + resumen del último ── */}
        <div className="mb-4 rounded-[24px] border bg-white p-4 shadow-sm md:mb-6 md:p-5 dark:bg-gray-900">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold">
              Proveedores {nProveedores !== null && nProveedores > 0 && (
                <span className="ml-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand">{nProveedores}</span>
              )}
            </h3>
            <Link href={`${prefix}/suppliers`} className="flex items-center gap-0.5 text-xs font-semibold text-brand">
              Ver todas <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Solo el ÚLTIMO agregado — la lista completa vive en Proveedores */}
          {proveedores.length > 0 && proveedores[0] && (
            <div className="mb-2.5 flex min-w-0 items-center gap-3 rounded-xl bg-muted/40 p-2.5">
              {(() => {
                const Icono = TIPO_ICONO[proveedores[0]!.type] ?? Link2;
                return (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                    <Icono className="h-4 w-4" />
                  </span>
                );
              })()}
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">{proveedores[0]!.title}</b>
                {proveedores[0]!.url && (
                  <a href={proveedores[0]!.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline">
                    {proveedores[0]!.url}
                  </a>
                )}
              </div>
              {proveedores[0]!.rating > 0 && (
                <span className="shrink-0 text-[11px]">{"⭐".repeat(Math.min(5, proveedores[0]!.rating))}</span>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={urlRapida}
              onChange={(e) => setUrlRapida(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") agregarUrlRapida();
              }}
              inputMode="url"
              placeholder="Pega una URL (web, GitHub, Instagram…)"
              className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              onClick={agregarUrlRapida}
              disabled={guardandoUrl || !urlRapida.trim()}
              className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {guardandoUrl ? "…" : "Agregar"}
            </button>
          </div>
          {avisoUrl && <p className="mt-1.5 break-words text-[11px] font-medium text-brand">{avisoUrl}</p>}
        </div>

        {/* ── Próximas citas — alimentadas por el bot de Telegram ── */}
        <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm md:mb-6 md:p-5 dark:bg-gray-900">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-semibold">Próximas citas</h3>
            <Link href={`${prefix}/calendar`} className="flex items-center gap-0.5 text-xs font-semibold text-brand">
              Ver agenda <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {proximas.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Sin citas agendadas. Háblale a tu bot de Telegram:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/cita reunión mañana 3pm</code>
            </p>
          ) : (
            proximas.map((cita) => {
              const f = bogota(new Date(cita.startsAt));
              return (
                <div key={cita.startsAt + cita.title} className="flex items-center gap-3 border-b py-3 last:border-0 last:pb-0">
                  <div className="flex h-[52px] w-[48px] shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-tint text-brand-text">
                    <b className="text-[17px] leading-none">{f.dia}</b>
                    <span className="text-[10px] font-semibold uppercase">{f.mesCorto}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm font-semibold leading-snug line-clamp-2 md:line-clamp-none">{cita.title}</b>
                    <small className="text-xs text-muted-foreground">
                      {f.hora}
                      {cita.notes ? ` · ${cita.notes}` : ""}
                    </small>
                  </div>
                </div>
              );
            })
          )}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Agenda más con tu bot: <code className="rounded bg-muted px-1.5 py-0.5">/cita reunión mañana 3pm</code>
          </p>
        </div>

        {/* ── Tu semana: barras reales de tareas por día ── */}
        <div className="mb-4 rounded-[28px] border bg-white p-4 shadow-sm md:mb-6 md:p-5 dark:bg-gray-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Tu semana</h3>
            <span className="text-[11px] font-medium text-muted-foreground">tareas por día</span>
          </div>
          <div className="flex items-end justify-between gap-1.5 md:gap-2.5">
            {semana.map((d) => (
              <div key={d.label + d.esHoy} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={`text-[11px] font-bold ${d.esHoy ? "text-brand" : "text-muted-foreground"}`}>
                  {d.n > 0 ? d.n : ""}
                </span>
                <div
                  className={`w-full rounded-full transition-all duration-700 ${
                    d.esHoy
                      ? "bg-gradient-to-t from-brand to-[#4da3ff]"
                      : d.n > 0
                        ? "bg-brand/35"
                        : "bg-muted h-1.5"
                  }`}
                  style={{ height: d.n > 0 ? `${14 + (d.n / maxSemana) * 52}px` : "6px" }}
                />
                <span className={`text-[10px] font-semibold ${d.esHoy ? "text-brand" : "text-muted-foreground"}`}>
                  {d.esHoy ? "hoy" : d.label}
                </span>
              </div>
            ))}
          </div>
        </div>


        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4 md:gap-6">
            {/* Tareas de hoy (las crea el bot de Telegram con /tarea) */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <h3 className="mb-1 font-semibold">Tareas de hoy</h3>
              {tareas.slice(0, 5).length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">
                  Sin tareas pendientes — crea una con <b>/tarea</b> en Telegram
                </p>
              )}
              {tareas.slice(0, 5).map((tarea) => {
                const vencida =
                  tarea.dueDate &&
                  !Number.isNaN(new Date(tarea.dueDate).getTime()) &&
                  new Date(tarea.dueDate).getTime() < ahora;
                return (
                <button
                  key={tarea.id}
                  type="button"
                  onClick={() => alternarTarea(tarea.id, true)}
                  className="flex w-full items-center gap-3 border-b py-3 text-left transition-transform last:border-0 last:pb-0 active:scale-[0.98]"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all active:scale-90 ${
                      vencida
                        ? "border-[#ff3b30] bg-[#ff3b30]/10 text-[#ff3b30]"
                        : "border-gray-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className={`block truncate text-sm font-semibold ${vencida ? "text-[#c03a2e]" : ""}`}>
                      {tarea.title}
                    </b>
                    <small className={`text-xs ${vencida ? "font-semibold text-[#ff3b30]" : "text-muted-foreground"}`}>
                      {vencida ? "⚠️ vencida · " : ""}{tareaMeta(tarea)}
                    </small>
                  </div>
                </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4 md:gap-6">
            {/* En tus recursos — recursos guardados de verdad */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Database className="h-4 w-4 text-brand" /> En tus recursos
                </h3>
                <Link href={`${prefix}/vault`} className="flex items-center gap-0.5 text-xs font-semibold text-brand">
                  Ver recursos <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {boveda.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nada guardado aún — agrega repos, páginas o herramientas en Recursos.
                </p>
              ) : (
                boveda.map((item) => {
                  const Icono = item.type === "repo" ? Github : item.type === "herramienta" ? Wrench : Globe;
                  return (
                    <div key={item.id} className="flex items-center gap-3 border-b py-3 last:border-0 last:pb-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                        <Icono className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-sm font-semibold">{item.title}</b>
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline">
                            {item.url}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Comandos de tu mayordomo (Telegram) */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <h3 className="mb-2 font-semibold">Háblale a tu mayordomo 🤖</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                En Telegram, mándale esto a tu bot y queda en tu CRM al instante:
              </p>
              <div className="space-y-1.5 text-sm">
                {[
                  ["/cita reunión con Juan mañana 3pm", "agenda la cita y te avisa 1h antes"],
                  ["/tarea llamar a María urgente 30 min", "crea la tarea y te fastidia hasta hacerla"],
                  ["/pendientes", "te lista todo lo pendiente"],
                  ["/listo llamar a maría", "marca la tarea hecha"],
                ].map(([cmd, desc]) => (
                  <div key={cmd} className="flex flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                    <code className="shrink-0 text-xs font-semibold">{cmd}</code>
                    <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
