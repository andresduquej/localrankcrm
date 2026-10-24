"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CheckSquare,
  ChevronRight,
  DollarSign,
  MessageSquare,
  Plus,
  Target,
  TrendingUp,
  UserCircle,
} from "lucide-react";

const STATS = [
  { label: "Compañías", value: "24", icon: Building2, change: "+3 esta semana" },
  { label: "Personas", value: "156", icon: UserCircle, change: "+12 este mes" },
  { label: "Oportunidades", value: "18", icon: Target, change: "$245K pipeline" },
  { label: "Tareas pendientes", value: "7", icon: CheckSquare, change: "3 vencen hoy" },
  { label: "Conversaciones", value: "42", icon: MessageSquare, change: "5 sin responder" },
  { label: "Ingresos mes", value: "$32.5K", icon: DollarSign, change: "+15% vs anterior" },
];

const RECENT_ACTIVITY = [
  { type: "deal", text: "Nueva oportunidad: Contrato Enterprise con TechCorp", time: "Hace 2h" },
  { type: "task", text: "Tarea completada: Enviar propuesta a MediaGroup", time: "Hace 3h" },
  { type: "contact", text: "Nuevo contacto: María García — LogiNext", time: "Hace 5h" },
  { type: "message", text: "Mensaje de WhatsApp: Carlos Ruiz respondió a cotización", time: "Hace 6h" },
  { type: "note", text: "Nota añadida: Seguimiento reunión con InnovateLab", time: "Ayer" },
  { type: "deal", text: "Oportunidad cerrada ganada: Paquete Premium — $12K", time: "Ayer" },
];

const TOP_OPPORTUNITIES = [
  { name: "Contrato Enterprise TechCorp", value: "$85,000", stage: "Negociación", probability: 75 },
  { name: "Licencia Anual MediaGroup", value: "$45,000", stage: "Propuesta", probability: 60 },
  { name: "Implementación LogiNext", value: "$32,000", stage: "Calificación", probability: 40 },
  { name: "Consultoría InnovateLab", value: "$28,000", stage: "Descubrimiento", probability: 25 },
];

type Cita = {
  title: string;
  startsAt: string;
  notes?: string;
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

export default function DashboardPage() {
  const pathname = usePathname();
  const prefix = pathname.startsWith("/preview") ? "/preview" : "";
  const [nombre, setNombre] = useState("Andres");
  const [citas, setCitas] = useState<Cita[]>([]);

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
  }, []);

  const proximas = [...citas].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const citasHoy = proximas.filter((c) => esHoyBogota(c.startsAt)).length;
  const hoy = bogota(new Date());

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
              <span className="mt-2 inline-block rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">
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
              <Link
                href={`${prefix}/opportunities`}
                className="mt-3 block rounded-xl bg-brand px-4 py-2.5 text-center text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.98]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> Nueva oportunidad
                </span>
              </Link>
            </div>

            {/* Tareas de hoy */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <h3 className="mb-1 font-semibold">Tareas de hoy</h3>
              {[
                { t: "Enviar propuesta a Cafe Velázquez", d: "Alta · antes de 5 PM", hecha: false },
                { t: "Revisar cotización de Dental Sonrisa", d: "Media", hecha: true },
                { t: "Llamar a leads nuevos", d: "2 pendientes", hecha: false },
              ].map((tarea) => (
                <div key={tarea.t} className="flex items-center gap-3 border-b py-3 last:border-0 last:pb-0">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                      tarea.hecha ? "border-green-500 bg-green-500 text-white" : "border-gray-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className={`block truncate text-sm font-semibold ${tarea.hecha ? "text-muted-foreground line-through" : ""}`}>
                      {tarea.t}
                    </b>
                    <small className="text-xs text-muted-foreground">{tarea.d}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 md:gap-6">
            {/* Actividad reciente */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <h3 className="mb-4 font-semibold">Actividad reciente</h3>
              <div className="space-y-3">
                {RECENT_ACTIVITY.map((activity, i) => (
                  <div key={i} className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    <div className="flex-1">
                      <p className="text-sm">{activity.text}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top oportunidades */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm md:p-5">
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <TrendingUp className="h-4 w-4 text-brand" />
                Top oportunidades
              </h3>
              <div className="space-y-3">
                {TOP_OPPORTUNITIES.map((opp) => (
                  <div key={opp.name} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="min-w-0 flex-1 text-sm font-medium">{opp.name}</span>
                      <span className="text-sm font-bold text-brand">{opp.value}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="whitespace-nowrap rounded bg-muted px-2 py-0.5 text-xs">{opp.stage}</span>
                      <div className="min-w-0 flex-1">
                        <div className="h-1.5 w-full rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full bg-brand" style={{ width: `${opp.probability}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{opp.probability}%</span>
                    </div>
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
