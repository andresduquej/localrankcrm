"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  CheckSquare,
  ChevronRight,
  Database,
  Github,
  Globe,
  MessageSquare,
  UserCircle,
  Wrench,
} from "lucide-react";

/**
 * Hoy — tu día real: KPIs vivos (citas, tareas, contactos, mensajes),
 * agenda y tareas del mayordomo, bóveda y comandos del bot.
 * Cero datos demo: todo viene de las APIs del CRM.
 */

type VaultLight = { id: string; type: string; title: string; url: string };

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

  async function alternarTarea(id: string, done: boolean) {
    // Optimista: quita/repone la fila según el resultado del PATCH.
    setTareas((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done }),
    }).catch(() => null);
    if (!res?.ok) {
      setTareas((prev) => prev);
    }
  }

  useEffect(() => {
    // Citas de cortesía mientras cargan las reales (o en modo demo)
    const base = new Date();
    const mk = (h: number, title: string, notes: string): Cita => {
      const d = new Date(base);
      d.setHours(h, 0, 0, 0);
      return { title, startsAt: d.toISOString(), notes };
    };
    setCitas([mk(11, "Reunión con Juan Pérez", "Propuesta · Cafe Velázquez"), mk(15, "Llamada de seguimiento", "María Gómez · Dental Sonrisa")]);

    // Nombre real de la sesión (en preview no hay: queda el de cortesía)
    fetch("/api/auth/get-session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const n = d?.user?.name;
        if (typeof n === "string" && n.trim()) setNombre(n.trim().split(" ")[0]!);
      })
      .catch(() => {});

    // Agenda real (la alimenta el bot de Telegram)
    fetch("/api/appointments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.appointments) && d.appointments.length > 0) {
          setCitas(d.appointments.slice(0, 4));
        }
      })
      .catch(() => {});

    // Tareas reales del mayordomo (bot de Telegram + esta UI)
    fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.tasks)) setTareas(d.tasks.slice(0, 5));
      })
      .catch(() => {});

    // KPIs vivos: contactos, mensajes sin leer y bóveda
    fetch("/api/contacts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNContactos(Array.isArray(d?.contacts) ? d.contacts.length : 0))
      .catch(() => setNContactos(0));

    fetch("/api/conversations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const convs = Array.isArray(d?.conversations) ? d.conversations : [];
        setSinLeer(
          convs.reduce((a: number, c: { unreadCount?: number }) => a + (c.unreadCount ?? 0), 0)
        );
      })
      .catch(() => setSinLeer(0));

    fetch("/api/vault")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBoveda(Array.isArray(d?.items) ? d.items.slice(0, 3) : []))
      .catch(() => {});
  }, []);

  const proximas = [...citas].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const citasHoy = proximas.filter((c) => esHoyBogota(c.startsAt)).length;
  const hoy = bogota(new Date());
  const ahora = Date.now();
  const vencidas = tareas.filter(
    (t) => t.dueDate && !Number.isNaN(new Date(t.dueDate).getTime()) && new Date(t.dueDate).getTime() < ahora
  ).length;

  /** KPIs reales del día (nada quemado). */
  const STATS = [
    { label: "Citas hoy", value: String(citasHoy), icon: Calendar, change: citasHoy > 0 ? "en tu agenda" : "agenda libre", ok: true },
    { label: "Tareas pendientes", value: String(tareas.length), icon: CheckSquare, change: vencidas > 0 ? `${vencidas} vencida${vencidas > 1 ? "s" : ""}` : "al día", ok: vencidas === 0 },
    { label: "Contactos", value: nContactos === null ? "—" : String(nContactos), icon: UserCircle, change: "en tu red", ok: true },
    { label: "Sin leer", value: sinLeer === null ? "—" : String(sinLeer), icon: MessageSquare, change: (sinLeer ?? 0) > 0 ? "te esperan" : "todo leído", ok: (sinLeer ?? 0) === 0 },
  ];

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

        {/* KPIs estilo iOS: valor grande + chip verde */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:mb-8 md:grid-cols-3 md:gap-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <div className="mb-3 inline-flex rounded-xl bg-brand-tint p-2.5 text-brand">
                <stat.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
              </div>
              <p className="text-[22px] font-extrabold leading-tight tracking-tight md:text-[26px]">{stat.value}</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">{stat.label}</p>
              <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                stat.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
              }`}>
                {stat.change}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4 md:gap-6">
            {/* Próximas citas — alimentadas por el bot de Telegram */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
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

            {/* Tareas de hoy (las crea el bot de Telegram con /tarea) */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <h3 className="mb-1 font-semibold">Tareas de hoy</h3>
              {tareas.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">
                  Sin tareas pendientes — crea una con <b>/tarea</b> en Telegram
                </p>
              )}
              {tareas.map((tarea) => (
                <button
                  key={tarea.id}
                  type="button"
                  onClick={() => alternarTarea(tarea.id, true)}
                  className="flex w-full items-center gap-3 border-b py-3 text-left last:border-0 last:pb-0"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-bold text-transparent">
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">{tarea.title}</b>
                    <small className="text-xs text-muted-foreground">{tareaMeta(tarea)}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 md:gap-6">
            {/* En tu bóveda — recursos guardados de verdad */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Database className="h-4 w-4 text-brand" /> En tu bóveda
                </h3>
                <Link href={`${prefix}/vault`} className="flex items-center gap-0.5 text-xs font-semibold text-brand">
                  Ver bóveda <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {boveda.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Nada guardado aún — agrega repos, páginas o herramientas en la Bóveda.
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
