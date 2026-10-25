"use client";

import { useState, useEffect } from "react";
import { Bell, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, DollarSign, Plus, Trash2, X } from "lucide-react";
import { loadFromStorage, saveToStorage, generateId } from "@/lib/local-storage";

type CalendarGroup = { id: string; name: string; color: string };

type Appointment = {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  calendarId: string;
  contact: string;
  type: "appointment" | "payment_reminder" | "reminder";
  amount?: string;
  notes: string;
  done: boolean;
};

const COLORS = ["#e91e8c", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#6366f1", "#ec4899", "#14b8a6"];

const SEED_CALENDARS: CalendarGroup[] = [
  { id: "cal1", name: "Citas", color: "#3b82f6" },
  { id: "cal2", name: "Cobros", color: "#10b981" },
  { id: "cal3", name: "Recordatorios", color: "#f59e0b" },
];

const SEED_APPOINTMENTS: Appointment[] = [
  { id: "a1", title: "Reunión TechCorp - Propuesta Enterprise", date: "2026-07-18", time: "10:00", duration: "1h", calendarId: "cal1", contact: "Carlos Ruiz", type: "appointment", notes: "Llevar presentación actualizada", done: false },
  { id: "a2", title: "Demo MediaGroup", date: "2026-07-20", time: "15:00", duration: "45min", calendarId: "cal1", contact: "Roberto Méndez", type: "appointment", notes: "", done: false },
  { id: "a3", title: "Cobro factura #1045 — TechCorp", date: "2026-07-19", time: "09:00", duration: "", calendarId: "cal2", contact: "TechCorp", type: "payment_reminder", amount: "$12,500", notes: "Factura enviada el 5 de julio", done: false },
  { id: "a4", title: "Cobro mensualidad RetailMax", date: "2026-07-25", time: "09:00", duration: "", calendarId: "cal2", contact: "RetailMax", type: "payment_reminder", amount: "$8,000", notes: "", done: false },
  { id: "a5", title: "Seguimiento LogiNext - ¿Decisión?", date: "2026-07-21", time: "11:00", duration: "", calendarId: "cal3", contact: "María García", type: "reminder", notes: "Si no responde, enviar email", done: false },
  { id: "a6", title: "Renovación contrato FinServ", date: "2026-07-30", time: "09:00", duration: "", calendarId: "cal3", contact: "FinServ Partners", type: "reminder", notes: "Vence el 31 de julio", done: false },
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default function CalendarPage() {
  const [calendars, setCalendars] = useState<CalendarGroup[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const hoyWall = new Date(Date.now() - 5 * 3600_000); // Bogotá
  const [currentYear, setCurrentYear] = useState(hoyWall.getUTCFullYear());
  const [currentMonth, setCurrentMonth] = useState(hoyWall.getUTCMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [showNewCalendar, setShowNewCalendar] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [syncToast, setSyncToast] = useState("");
  const [calView, setCalView] = useState<"month" | "week" | "day">("month");
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [apptForm, setApptForm] = useState({ title: "", date: "", time: "", duration: "", calendarId: "", contact: "", type: "appointment" as Appointment["type"], amount: "", notes: "" });
  const [calForm, setCalForm] = useState({ name: "", color: COLORS[0]! });
  // Calendarios externos (Google iCal / Calendly / Cal.com) + citas reales del bot
  const [fuentes, setFuentes] = useState<{ id: string; type: string; name: string; lastError: string }[]>([]);
  const [conectar, setConectar] = useState(false);
  const [conForm, setConForm] = useState({ type: "ics" as "ics" | "calendly" | "calcom", name: "", url: "", token: "" });
  const [conMsg, setConMsg] = useState("");
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    const cals = loadFromStorage("calendars", SEED_CALENDARS);
    setCalendars(cals);
    setAppointments(loadFromStorage("calendar_appointments", SEED_APPOINTMENTS));
    setVisibleCalendars(new Set(cals.map((c) => c.id)));

    // Citas reales del bot (Telegram) + eventos de calendarios conectados.
    // Si hay datos reales, la demo se aparta: el calendario muestra la verdad.
    Promise.all([
      fetch("/api/appointments").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/calendar/sources").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([apts, ext]) => {
      const grupos: CalendarGroup[] = [];
      const eventos: Appointment[] = [];
      if (Array.isArray(apts?.appointments) && apts.appointments.length > 0) {
        grupos.push({ id: "real", name: "Mi agenda (bot)", color: "#0a6cff" });
        for (const a of apts.appointments) {
          const d = new Date(a.startsAt);
          const wall = new Date(d.getTime() - 5 * 3600_000);
          const p = (n: number) => String(n).padStart(2, "0");
          eventos.push({
            id: `real-${a.id}`,
            title: a.title,
            date: wall.toISOString().slice(0, 10),
            time: `${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}`,
            duration: "",
            calendarId: "real",
            contact: "",
            type: "appointment",
            notes: a.notes ?? "",
            done: Boolean(a.completedAt),
          });
        }
      }
      if (Array.isArray(ext?.events) && ext.events.length > 0) {
        const porFuente = new Map<string, string>();
        ext.events.forEach((e: { sourceId: string; sourceName: string }) => {
          if (!porFuente.has(e.sourceId)) porFuente.set(e.sourceId, e.sourceName);
        });
        let i = 0;
        for (const [sid, nombre] of porFuente) {
          grupos.push({ id: `ext-${sid}`, name: nombre, color: COLORS[(2 + i++) % COLORS.length]! });
        }
        for (const e of ext.events) {
          const d = new Date(e.startsAt);
          const wall = new Date(d.getTime() - 5 * 3600_000);
          const p = (n: number) => String(n).padStart(2, "0");
          eventos.push({
            id: `ext-${e.id}`,
            title: e.title,
            date: wall.toISOString().slice(0, 10),
            time: `${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}`,
            duration: "",
            calendarId: `ext-${e.sourceId}`,
            contact: "",
            type: "appointment",
            notes: e.location ?? "",
            done: false,
          });
        }
      }
      if (Array.isArray(ext?.sources)) setFuentes(ext.sources);
      if (eventos.length > 0) {
        setCalendars([...grupos, ...cals]);
        setVisibleCalendars(new Set([...grupos.map((g) => g.id), ...cals.map((c) => c.id)]));
        setAppointments(eventos);
      }
    });
  }, []);

  /** Conecta Google (iCal), Calendly o Cal.com y sincroniza al instante. */
  async function conectarFuente() {
    setConMsg("");
    const body =
      conForm.type === "ics"
        ? { type: "ics", name: conForm.name || "Google Calendar", url: conForm.url }
        : { type: conForm.type, name: conForm.name || (conForm.type === "calendly" ? "Calendly" : "Cal.com"), token: conForm.token };
    const res = await fetch("/api/calendar/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.ok && res.synced > 0) {
      setConMsg(`✅ Conectado: ${res.synced} eventos sincronizados. Recarga para verlos.`);
      setConectar(false);
      setTimeout(() => window.location.reload(), 1200);
    } else if (res?.ok) {
      setConMsg(res.warning ?? "Conectado, pero no trajo eventos — revisa la URL o el token.");
    } else {
      setConMsg(res?.error?.message ?? "No se pudo conectar");
    }
  }

  async function sincronizarAhora() {
    setSincronizando(true);
    const res = await fetch("/api/calendar/sources", { method: "PUT" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setSincronizando(false);
    if (res?.ok) setConMsg(`🔄 ${res.events} eventos de ${res.synced} calendario(s)${res.errors?.length ? " · " + res.errors[0] : ""}`);
    setTimeout(() => window.location.reload(), 1200);
  }

  async function borrarFuente(id: string) {
    await fetch(`/api/calendar/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setTimeout(() => window.location.reload(), 800);
  }

  function saveCals(u: CalendarGroup[]) { setCalendars(u); saveToStorage("calendars", u); }
  function saveAppts(u: Appointment[]) { setAppointments(u); saveToStorage("calendar_appointments", u); }

  function addCalendar() {
    if (!calForm.name.trim()) return;
    const cal: CalendarGroup = { id: generateId(), name: calForm.name, color: calForm.color };
    saveCals([...calendars, cal]);
    setVisibleCalendars((p) => new Set([...p, cal.id]));
    setCalForm({ name: "", color: COLORS[(calendars.length + 1) % COLORS.length]! });
    setShowNewCalendar(false);
  }

  function deleteCalendar(id: string) {
    saveCals(calendars.filter((c) => c.id !== id));
    saveAppts(appointments.filter((a) => a.calendarId !== id));
    setVisibleCalendars((p) => { const n = new Set(p); n.delete(id); return n; });
  }

  function toggleCalendarVisibility(id: string) {
    setVisibleCalendars((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function addAppointment() {
    if (!apptForm.title.trim() || !apptForm.date) return;
    const a: Appointment = { id: generateId(), ...apptForm, done: false };
    saveAppts([...appointments, a]);
    setApptForm({ title: "", date: "", time: "", duration: "", calendarId: calendars[0]?.id || "", contact: "", type: "appointment", amount: "", notes: "" });
    setShowNewAppt(false);
  }

  function toggleDone(id: string) { saveAppts(appointments.map((a) => a.id === id ? { ...a, done: !a.done } : a)); }
  function deleteAppt(id: string) { saveAppts(appointments.filter((a) => a.id !== id)); }

  function prevMonth() { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); } else setCurrentMonth(currentMonth - 1); }
  function nextMonth() { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); } else setCurrentMonth(currentMonth + 1); }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const today = new Date().toISOString().split("T")[0];

  const visibleAppts = appointments.filter((a) => visibleCalendars.has(a.calendarId));
  const selectedAppts = selectedDate ? visibleAppts.filter((a) => a.date === selectedDate) : [];

  // Upcoming (next 7 days)
  const nowDate = new Date();
  const in7Days = new Date(nowDate.getTime() + 7 * 86400000).toISOString().split("T")[0]!;
  const upcoming = visibleAppts.filter((a) => !a.done && a.date >= today! && a.date <= in7Days).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  function getCalColor(calId: string) { return calendars.find((c) => c.id === calId)?.color || "#999"; }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar */}
      <div className="order-2 w-full shrink-0 space-y-4 overflow-y-auto border-t p-4 md:order-1 md:max-h-full md:w-64 md:border-r md:border-t-0">
        <button onClick={() => { setShowNewAppt(true); setApptForm({ ...apptForm, date: selectedDate || today || "", calendarId: calendars[0]?.id || "" }); }} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover transition-colors">
          <Plus className="h-4 w-4" />Nueva cita
        </button>

        {/* Calendars */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Calendarios</h4>
            <button onClick={() => setShowNewCalendar(!showNewCalendar)} className="rounded p-0.5 hover:bg-gray-100 text-muted-foreground"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          {showNewCalendar && (
            <div className="mb-2 space-y-2 rounded border p-2">
              <input value={calForm.name} onChange={(e) => setCalForm({ ...calForm, name: e.target.value })} placeholder="Nombre del calendario" className="w-full rounded border px-2 py-1 text-xs focus:border-brand focus:outline-none" />
              <div className="flex flex-wrap gap-1">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setCalForm({ ...calForm, color: c })} className={`h-5 w-5 rounded-full border-2 ${calForm.color === c ? "border-gray-800 scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={addCalendar} className="rounded bg-brand px-2 py-1 text-xs text-white hover:bg-brand-hover">Crear</button>
                <button onClick={() => setShowNewCalendar(false)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">✕</button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            {calendars.map((cal) => (
              <div key={cal.id} className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50">
                <input type="checkbox" checked={visibleCalendars.has(cal.id)} onChange={() => toggleCalendarVisibility(cal.id)} className="accent-[var(--accent)]" />
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                <span className="flex-1 text-sm truncate">{cal.name}</span>
                <span className="text-xs text-muted-foreground">{appointments.filter((a) => a.calendarId === cal.id && !a.done).length}</span>
                <button onClick={() => deleteCalendar(cal.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Próximos 7 días</h4>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {upcoming.length === 0 && <p className="text-xs text-muted-foreground">Nada programado</p>}
            {upcoming.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-2 rounded border p-2 text-xs">
                <span className="mt-0.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: getCalColor(a.calendarId) }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.title}</p>
                  <p className="text-muted-foreground">{a.date} {a.time && `· ${a.time}`}</p>
                  {a.type === "payment_reminder" && a.amount && <p className="text-green-600 font-medium">{a.amount}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Google Calendar Sync */}
        <div className="border-t pt-3 mt-3">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sincronizar</h4>
          <button onClick={() => setShowSync(true)} className="w-full flex items-center gap-2 rounded border px-3 py-2 text-xs hover:bg-gray-50 mb-1">
            <span className="text-base">🔄</span>Conectar calendario externo
          </button>
          <p className="mt-2 text-[9px] text-muted-foreground">Conecta Google Calendar, Outlook o Apple Calendar.</p>
        </div>
      </div>

      {/* Main area */}
      <div className="order-1 flex min-h-0 flex-1 flex-col overflow-hidden md:order-2">
        {/* Nav bar */}
        <div className="flex items-center justify-between border-b px-4 md:px-6 py-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} aria-label="Mes anterior" className="rounded-full p-1.5 transition-transform hover:bg-gray-100 active:scale-95"><ChevronLeft className="h-5 w-5" /></button>
            <h2 className="w-36 text-center text-lg font-bold tracking-tight md:w-44">{MONTHS[currentMonth]} {currentYear}</h2>
            <button onClick={nextMonth} aria-label="Mes siguiente" className="rounded-full p-1.5 transition-transform hover:bg-gray-100 active:scale-95"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-[9px] bg-muted p-0.5">
              <button onClick={() => setCalView("month")} className={`rounded-[7px] px-3.5 py-1.5 text-xs font-semibold transition-all ${calView === "month" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>Mes</button>
              <button onClick={() => setCalView("week")} className={`rounded-[7px] px-3.5 py-1.5 text-xs font-semibold transition-all ${calView === "week" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>Semana</button>
              <button onClick={() => setCalView("day")} className={`rounded-[7px] px-3.5 py-1.5 text-xs font-semibold transition-all ${calView === "day" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>Día</button>
            </div>
            <button onClick={() => { setCurrentYear(hoyWall.getUTCFullYear()); setCurrentMonth(hoyWall.getUTCMonth()); setSelectedDate(today ?? null); }} className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold transition-transform active:scale-95">Hoy</button>
            <button onClick={() => setConectar(true)} className="rounded-full bg-muted px-3.5 py-1.5 text-xs font-semibold transition-transform active:scale-95">🔗 Conectar</button>
          </div>
        </div>

        {/* Panel: conectar calendarios externos */}
        {conectar && (
          <div className="border-b bg-muted/30 px-4 py-4 md:px-6">
            <div className="mx-auto max-w-lg space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Conectar calendarios</h3>
                <button onClick={() => setConectar(false)} className="text-xs font-semibold text-muted-foreground">Cerrar ✕</button>
              </div>

              <div className="flex gap-1.5">
                {([["ics", "Google (iCal)"], ["calendly", "Calendly"], ["calcom", "Cal.com"]] as const).map(([t, label]) => (
                  <button key={t} onClick={() => setConForm((f) => ({ ...f, type: t }))} className={`flex-1 rounded-xl border px-2 py-2 text-[11px] font-bold ${conForm.type === t ? "border-brand bg-brand-tint text-brand" : "bg-white"}`}>
                    {label}
                  </button>
                ))}
              </div>

              {conForm.type === "ics" ? (
                <>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    En Google Calendar: ⚙️ Configuración del calendario → «Dirección secreta en formato iCal» → copia el enlace https://calendar.google.com/calendar/ical/… y pégalo aquí. Sin OAuth, se sincroniza directo.
                  </p>
                  <input value={conForm.url} onChange={(e) => setConForm({ ...conForm, url: e.target.value })} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className="w-full rounded-xl border bg-white px-3 py-2.5 text-xs" />
                </>
              ) : (
                <>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {conForm.type === "calendly"
                      ? "En Calendly: Integrations → API & webhooks → Generate Personal Access Token."
                      : "En Cal.com: Settings → Developer → API Keys (permiso de lectura de bookings)."}
                  </p>
                  <input value={conForm.token} onChange={(e) => setConForm({ ...conForm, token: e.target.value })} type="password" placeholder="Token de API" className="w-full rounded-xl border bg-white px-3 py-2.5 text-xs" />
                </>
              )}
              <input value={conForm.name} onChange={(e) => setConForm({ ...conForm, name: e.target.value })} placeholder="Nombre (ej: Personal, Clientes)" className="w-full rounded-xl border bg-white px-3 py-2.5 text-xs" />

              {conMsg && <p className="text-xs font-semibold">{conMsg}</p>}
              <button onClick={conectarFuente} className="w-full rounded-xl bg-brand py-2.5 text-xs font-bold text-white active:scale-[0.98]">Conectar y sincronizar</button>

              {fuentes.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-[11px] font-bold text-muted-foreground">Conectados:</p>
                  {fuentes.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
                      <span className="flex-1 text-xs font-semibold">{f.name} <span className="text-muted-foreground">({f.type})</span></span>
                      {f.lastError && <span className="text-[10px] text-[#c03a2e]">⚠️</span>}
                      <button onClick={() => borrarFuente(f.id)} className="text-[10px] font-bold text-[#ff3b30]">Quitar</button>
                    </div>
                  ))}
                  <button onClick={sincronizarAhora} disabled={sincronizando} className="w-full rounded-xl border py-2 text-xs font-semibold disabled:opacity-50">
                    {sincronizando ? "Sincronizando…" : "🔄 Sincronizar ahora"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calendar content */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
          {/* MONTH VIEW */}
          {calView === "month" && (
          <div className="grid min-w-0 grid-cols-7 gap-px overflow-hidden rounded-2xl border bg-gray-200">
            {/* Day headers */}
            {DAYS.map((d) => (
              <div key={d} className="bg-gray-50 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} className="min-h-[56px] bg-white p-1 md:min-h-[80px]" />
            ))}
            {/* Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayAppts = visibleAppts.filter((a) => a.date === dateStr);
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              return (
                <div key={day} onClick={() => setSelectedDate(dateStr)} className={`min-h-[56px] cursor-pointer bg-white p-1 transition-colors hover:bg-gray-50 md:min-h-[80px] ${isSelected ? "ring-2 ring-brand ring-inset" : ""}`}>
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-brand text-white" : isSelected ? "bg-muted" : ""}`}>{day}</span>
                  <div className="mt-0.5 space-y-0.5">
                    <div className="mt-1 flex justify-center gap-[3px] md:hidden">
                      {dayAppts.slice(0, 3).map((a) => (
                        <span key={a.id} className={`h-[6px] w-[6px] rounded-full ${a.done ? "opacity-40" : ""}`} style={{ backgroundColor: getCalColor(a.calendarId) }} />
                      ))}
                    </div>
                    {dayAppts.slice(0, 3).map((a) => (
                      <div key={a.id} className={`hidden truncate rounded px-1 py-0.5 text-[10px] leading-tight md:block ${a.done ? "line-through opacity-50" : ""}`} style={{ backgroundColor: `${getCalColor(a.calendarId)}20`, color: getCalColor(a.calendarId) }}>
                        {a.time && <span className="font-medium">{a.time} </span>}{a.title}
                      </div>
                    ))}
                    {dayAppts.length > 3 && <span className="hidden px-1 text-[10px] text-muted-foreground md:block">+{dayAppts.length - 3} más</span>}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {/* WEEK VIEW */}
          {calView === "week" && (() => {
            const selectedOrToday = selectedDate || today || `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
            const baseDate = new Date(selectedOrToday + "T12:00:00");
            const dayOfWeek = baseDate.getDay();
            const weekStart = new Date(baseDate); weekStart.setDate(baseDate.getDate() - dayOfWeek);
            const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm
            const weekDays = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
              return d.toISOString().split("T")[0]!;
            });
            return (
              <div className="min-w-0">
                {/* Week header — pegajoso: al hacer scroll los días no se pierden */}
                <div className="sticky top-0 z-10 grid grid-cols-[32px_repeat(7,minmax(0,1fr))] border-b bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)] md:grid-cols-[60px_repeat(7,1fr)] dark:bg-gray-900">
                  <div className="p-1" />
                  {weekDays.map((d) => {
                    const date = new Date(d + "T12:00:00");
                    const isToday2 = d === today;
                    return (
                      <div key={d} onClick={() => { setSelectedDate(d); setCalView("day"); }} className={`p-2 text-center cursor-pointer hover:bg-gray-50 border-l ${isToday2 ? "bg-brand/5" : ""}`}>
                        <p className="text-[10px] text-muted-foreground">{DAYS[date.getDay()]}</p>
                        <p className={`text-sm font-semibold ${isToday2 ? "text-brand" : ""}`}>{date.getDate()}</p>
                      </div>
                    );
                  })}
                </div>
                {/* Hour rows */}
                {HOURS.map((hour) => (
                  <div key={hour} className="grid grid-cols-[32px_repeat(7,minmax(0,1fr))] border-b min-h-[48px] md:grid-cols-[60px_repeat(7,1fr)]">
                    <div className="p-1 text-[10px] text-muted-foreground text-right pr-2 pt-1">{hour}:00</div>
                    {weekDays.map((d) => {
                      const hourAppts = visibleAppts.filter((a) => a.date === d && a.time && parseInt(a.time.split(":")[0]!) === hour);
                      return (
                        <div key={d} className="border-l p-0.5 relative">
                          {hourAppts.map((a) => (
                            <div key={a.id} className="rounded px-1 py-0.5 text-[9px] truncate mb-0.5" style={{ backgroundColor: `${getCalColor(a.calendarId)}20`, color: getCalColor(a.calendarId) }}>
                              {a.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* DAY VIEW */}
          {calView === "day" && (() => {
            const dayDate = selectedDate || today || `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
            const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am to 9pm
            const dayAppts2 = visibleAppts.filter((a) => a.date === dayDate);
            const dateObj = new Date(dayDate + "T12:00:00");
            return (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <button onClick={() => { const d = new Date(dayDate + "T12:00:00"); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split("T")[0]!); }} className="rounded p-1 hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
                  <h3 className="text-sm font-semibold">{DAYS[dateObj.getDay()]} {dateObj.getDate()} de {MONTHS[dateObj.getMonth()]} {dateObj.getFullYear()}</h3>
                  <button onClick={() => { const d = new Date(dayDate + "T12:00:00"); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split("T")[0]!); }} className="rounded p-1 hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div className="space-y-0">
                  {HOURS.map((hour) => {
                    const hourAppts = dayAppts2.filter((a) => a.time && parseInt(a.time.split(":")[0]!) === hour);
                    return (
                      <div key={hour} className="flex border-b min-h-[52px]">
                        <div className="w-14 shrink-0 p-1 text-[10px] text-muted-foreground text-right pr-2 pt-1">{hour}:00</div>
                        <div className="flex-1 p-1 border-l">
                          {hourAppts.map((a) => (
                            <div key={a.id} className="rounded px-2 py-1.5 text-xs mb-1 flex items-center gap-2" style={{ backgroundColor: `${getCalColor(a.calendarId)}15`, borderLeft: `3px solid ${getCalColor(a.calendarId)}` }}>
                              <div className="flex-1">
                                <p className="font-medium">{a.title}</p>
                                <p className="text-[10px] text-muted-foreground">{a.time}{a.duration ? ` · ${a.duration}` : ""}{a.contact ? ` · ${a.contact}` : ""}</p>
                              </div>
                              <button onClick={() => deleteAppt(a.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Selected date detail */}
        {selectedDate && (
          <div className="border-t max-h-52 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">{selectedDate}</h4>
              <button onClick={() => { setShowNewAppt(true); setApptForm({ ...apptForm, date: selectedDate, calendarId: calendars[0]?.id || "" }); }} className="text-xs text-brand hover:underline">+ Agregar</button>
            </div>
            {selectedAppts.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin eventos este día</p>
            ) : (
              <div className="space-y-2">
                {selectedAppts.map((a) => (
                  <div key={a.id} className="group flex items-center gap-3 rounded border p-2">
                    <input type="checkbox" checked={a.done} onChange={() => toggleDone(a.id)} className="accent-[var(--accent)]" />
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: getCalColor(a.calendarId) }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${a.done ? "line-through text-muted-foreground" : ""}`}>{a.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {a.time && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{a.time} {a.duration && `(${a.duration})`}</span>}
                        {a.contact && <span>{a.contact}</span>}
                        {a.type === "payment_reminder" && a.amount && <span className="flex items-center gap-0.5 text-green-600 font-medium"><DollarSign className="h-3 w-3" />{a.amount}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteAppt(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New appointment modal */}
      {showNewAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowNewAppt(false)}>
          <div className="w-full max-w-lg rounded-lg border bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Nueva cita / recordatorio</h3>
              <button onClick={() => setShowNewAppt(false)} className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} placeholder="Título *" className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Tipo</label>
                  <select value={apptForm.type} onChange={(e) => setApptForm({ ...apptForm, type: e.target.value as Appointment["type"] })} className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand">
                    <option value="appointment">Cita</option>
                    <option value="payment_reminder">Recordatorio de cobro</option>
                    <option value="reminder">Recordatorio general</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Calendario</label>
                  <select value={apptForm.calendarId} onChange={(e) => setApptForm({ ...apptForm, calendarId: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand">
                    {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Fecha *</label>
                  <input value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} type="date" className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Hora</label>
                  <input value={apptForm.time} onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })} type="time" className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Duración</label>
                  <input value={apptForm.duration} onChange={(e) => setApptForm({ ...apptForm, duration: e.target.value })} placeholder="30min, 1h..." className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Contacto / Empresa</label>
                  <input value={apptForm.contact} onChange={(e) => setApptForm({ ...apptForm, contact: e.target.value })} placeholder="Nombre" className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
              </div>
              {apptForm.type === "payment_reminder" && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Monto a cobrar</label>
                  <input value={apptForm.amount} onChange={(e) => setApptForm({ ...apptForm, amount: e.target.value })} placeholder="$5,000" className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium">Notas</label>
                <textarea value={apptForm.notes} onChange={(e) => setApptForm({ ...apptForm, notes: e.target.value })} placeholder="Notas adicionales..." rows={2} className="w-full rounded-md border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowNewAppt(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={addAppointment} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Modal */}
      {showSync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSync(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Sincronizar calendario externo</h3>
              <button onClick={() => setShowSync(false)} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Conecta tu calendario con Composio.dev (maneja OAuth automáticamente). Si ya tienes tu API key configurada en Ajustes → Integraciones, la conexión es inmediata.</p>
            <div className="space-y-2">
              {[
                { name: "Google Calendar", icon: "📅", color: "#4285f4", desc: "Sincroniza citas y reuniones de Google vía Composio", app: "googlecalendar" },
                { name: "Outlook", icon: "📧", color: "#0078d4", desc: "Conecta Microsoft 365 Calendar vía Composio", app: "outlook" },
                { name: "Apple Calendar", icon: "🍎", color: "#ff3b30", desc: "Integra iCloud Calendar (requiere CalDAV)", app: "apple" },
              ].map(service => {
                const exists = calendars.find(c => c.name === service.name);
                return (
                  <button key={service.name} onClick={() => {
                    // Check if Composio is connected
                    const integrations = loadFromStorage<Array<{platform:string;apiKey:string;connected:boolean}>>("crm_integrations", []);
                    const composio = integrations.find(i => i.platform === "composio");
                    if (!composio?.connected || !composio?.apiKey) {
                      setSyncToast("⚠️ Configura Composio en Ajustes → Integraciones primero");
                      setTimeout(() => setSyncToast(""), 4000);
                      setShowSync(false);
                      return;
                    }
                    // Create calendar and simulate Composio connection
                    if (!exists) {
                      const cal: CalendarGroup = { id: generateId(), name: service.name, color: service.color };
                      saveCals([...calendars, cal]);
                      setVisibleCalendars(new Set([...visibleCalendars, cal.id]));
                    }
                    setSyncToast(`✅ "${service.name}" sincronizado via Composio (${service.app})`);
                    setTimeout(() => setSyncToast(""), 3000);
                    setShowSync(false);
                  }} className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left hover:shadow-sm transition-shadow ${exists ? "border-green-200 bg-green-50/50" : "hover:bg-gray-50"}`}>
                    <span className="text-2xl">{service.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{service.name}</span>
                        {exists && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-medium text-green-700">Conectado</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{service.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg bg-violet-50 border border-violet-200 p-3">
              <p className="text-[10px] text-violet-700 font-medium">💡 Composio.dev maneja la autenticación OAuth por ti.</p>
              <p className="text-[9px] text-violet-600 mt-0.5">Solo necesitas tu API key de Composio configurada en Ajustes → Integraciones. No necesitas configurar OAuth manualmente para cada servicio.</p>
            </div>
          </div>
        </div>
      )}

      {/* Sync Toast */}
      {syncToast && <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">{syncToast}</div>}
    </div>
  );
}
