"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Mic, MicOff, Send, Sparkles, X } from "lucide-react";
import { loadFromStorage, saveToStorage, generateId } from "@/lib/local-storage";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  action?: string;
};

const SUGGESTIONS = [
  "Agéndame una cita con Juan mañana 3pm",
  "¿Cuántos contactos tengo?",
  "Crea una tarea: Llamar a cliente mañana",
  "Crea un contacto: Juan Pérez, 3001234567",
];

/** fetch con tope de 8 s: un endpoint lento no debe colgar el envío. */
function getJson(url: string): Promise<unknown> {
  return fetch(url, { signal: AbortSignal.timeout(8_000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/**
 * Contexto del CRM para el agente. Lo que vive en la BASE DE DATOS (citas,
 * tareas, contactos, proveedores) se trae de sus APIs — localStorage queda
 * vacío para esos módulos y el agente "no encontraba" nada. El resto de
 * módulos (pipeline, checklists, notas…) siguen leyendo su localStorage.
 */
async function getCrmContext(): Promise<Record<string, unknown>> {
  const [agenda, tareas, contactos, proveedores] = await Promise.all([
    getJson("/api/appointments"),
    getJson("/api/tasks"),
    getJson("/api/crm/contacts"),
    getJson("/api/suppliers"),
  ]);

  // Agenda real: {id, title, startsAt ISO} → fecha/hora en hora de COLOMBIA
  // (UTC-5 fijo, igual que el resto de la app). Cortar el ISO directo daba
  // la hora UTC (+5 h) y las citas de la tarde-noche con fecha del día
  // siguiente: por eso el modelo "no veía" las reuniones de mañana.
  const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const citas = (Array.isArray((agenda as { appointments?: unknown[] })?.appointments)
    ? (agenda as { appointments: Record<string, unknown>[] }).appointments
    : []
  ).map((a) => {
    const d = typeof a.startsAt === "string" ? new Date(a.startsAt) : null;
    const wall = d && !Number.isNaN(d.getTime()) ? new Date(d.getTime() - 5 * 3600_000) : null;
    return {
      id: a.id,
      title: a.title,
      startsAt: a.startsAt,
      date: wall
        ? `${wall.toISOString().slice(0, 10)} ${DIAS_CORTOS[wall.getUTCDay()]}`
        : "",
      time: wall ? wall.toISOString().slice(11, 16) : "",
      completed: Boolean(a.completedAt),
    };
  });

  const tareasBd = (Array.isArray((tareas as { tasks?: unknown[] })?.tasks)
    ? (tareas as { tasks: Record<string, unknown>[] }).tasks
    : []
  ).map((t) => ({
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate,
    done: t.done,
  }));

  const contactosBd = (Array.isArray((contactos as { contacts?: unknown[] })?.contacts)
    ? (contactos as { contacts: Record<string, unknown>[] }).contacts
    : []
  ).map((c) => ({
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    role: c.role,
    archived: c.archived ?? c.archivedAt != null,
  }));

  const proveedoresBd = (Array.isArray((proveedores as { items?: unknown[] })?.items)
    ? (proveedores as { items: Record<string, unknown>[] }).items
    : []
  ).map((s) => ({
    name: s.title,
    url: s.url,
    rating: s.rating,
    tags: s.tags,
  }));

  return {
    // BD real:
    calendarAppointments: citas,
    tasks: tareasBd,
    contacts: contactosBd,
    suppliers: proveedoresBd,
    // Módulos que aún viven en este navegador:
    pipelineStages: loadFromStorage("pipeline_stages", []),
    pipelineLeads: loadFromStorage("pipeline_leads", []),
    inboxConversations: loadFromStorage("inbox_conversations", []),
    focusTasks: loadFromStorage("focus_tasks", []),
    checklists: loadFromStorage("checklists_v2", []),
    meetingReminders: loadFromStorage("meeting_reminders", []),
    automations: loadFromStorage("crm_automations", []),
    proposals: loadFromStorage("proposals", []),
    projects: loadFromStorage("projects_v3", []),
    socialProfiles: loadFromStorage("social_profiles", []),
    coldContacts: loadFromStorage("cold_contacts", []),
    carteraInvoices: loadFromStorage("cartera_invoices", []),
    carteraAgreements: loadFromStorage("cartera_agreements", []),
    formEntries: loadFromStorage("crm_form_entries", []),
    crmForms: loadFromStorage("crm_forms", []),
    radarClips: loadFromStorage("radar_clips", []),
    linkedinProfiles: loadFromStorage("linkedin_profiles", []),
    notes: loadFromStorage("notes", []),
    todos: loadFromStorage("todos", {}),
    companies: loadFromStorage("companies", []),
    reminders: loadFromStorage("reminders_v2", []),
  };
}

/** Convierte lo que diga el modelo ("2026-10-26T15:00:00-05:00", "2026-10-26 15:00"…) a ISO válido. */
function aIso(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Prioridad que entiende /api/tasks (el modelo puede traer "alta|media|baja"). */
function prioridadApi(v: unknown): "high" | "medium" | "low" {
  const s = String(v ?? "").toLowerCase();
  if (["high", "alta", "urgente"].includes(s)) return "high";
  if (["low", "baja"].includes(s)) return "low";
  return "medium";
}

/** Ejecuta una acción del modelo DE VERDAD contra las APIs del CRM (BD). */
async function executeAction(action: Record<string, unknown>): Promise<string> {
  const type = action.type as string;

  switch (type) {
    case "create_appointment": {
      const title = String(action.title || "").trim();
      const startsAt = aIso(action.startsAt);
      if (!title) return "⚠️ No entendí el título de la cita — dime qué y cuándo.";
      if (!startsAt) return "⚠️ No entendí la fecha/hora de la cita — repítela (ej: mañana 3pm).";
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          startsAt,
          ...(typeof action.notes === "string" && action.notes ? { notes: action.notes } : {}),
        }),
      }).catch(() => null);
      if (!res?.ok) return "❌ No pude agendar la cita. Intenta de nuevo.";
      return `✅ Cita agendada: "${title}" — ${new Date(startsAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}.`;
    }

    case "reschedule_appointment": {
      const needle = String(action.title || "").trim().toLowerCase();
      const startsAt = aIso(action.startsAt);
      if (!needle) return "⚠️ ¿Qué cita reprogramo? Dímelo como aparece en tu agenda.";
      if (!startsAt) return "⚠️ No entendí la nueva fecha/hora — repítela (ej: el martes 4pm).";
      const list = await getJson("/api/appointments");
      const citas = (Array.isArray((list as { appointments?: unknown[] })?.appointments)
        ? (list as { appointments: Record<string, unknown>[] }).appointments
        : []);
      const hit = citas.find(
        (a) =>
          !a.completedAt &&
          String(a.title ?? "").toLowerCase().includes(needle)
      );
      if (!hit) {
        return `No encontré una cita pendiente que coincida con "${action.title}". Mira los títulos exactos en tu agenda e inténtalo de nuevo.`;
      }
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hit.id, startsAt }),
      }).catch(() => null);
      if (!res?.ok) return "❌ No pude reprogramar la cita. Intenta de nuevo.";
      return `✅ Cita "${hit.title}" reprogramada para ${new Date(startsAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}.`;
    }

    case "create_task": {
      const title = String(action.title || "").trim();
      if (!title) return "⚠️ No entendí el título de la tarea.";
      const dueDate = aIso(action.dueDate);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          priority: prioridadApi(action.priority),
          ...(dueDate ? { dueDate } : {}),
        }),
      }).catch(() => null);
      if (!res?.ok) return "❌ No pude crear la tarea. Intenta de nuevo.";
      return `✅ Tarea creada: "${title}"${dueDate ? ` — vence ${new Date(dueDate).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}` : ""}.`;
    }

    case "create_contact": {
      const name = String(action.name || "").trim();
      if (!name) return "⚠️ ¿Cómo se llama el contacto? Dime el nombre y lo creo.";
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: typeof action.phone === "string" ? action.phone : "",
          email: typeof action.email === "string" ? action.email : "",
          company: typeof action.company === "string" ? action.company : "",
          role: typeof action.role === "string" ? action.role : "",
          tags: Array.isArray(action.tags) ? action.tags.map(String) : [],
        }),
      }).catch(() => null);
      if (!res?.ok) return "❌ No pude crear el contacto. Intenta de nuevo.";
      return `✅ Contacto "${name}" creado en tu CRM.`;
    }

    case "archive_contact": {
      const name = String(action.name || "").trim().toLowerCase();
      if (!name) return "⚠️ ¿A quién archivo? Dime el nombre.";
      const list = await fetch("/api/crm/contacts").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const contacts = (Array.isArray(list?.contacts) ? list.contacts : []) as Array<{ id: string; name: string; archived?: boolean }>;
      const hit = contacts.find((c) => !c.archived && c.name?.toLowerCase().includes(name));
      if (!hit) return `No encontré un contacto activo llamado "${action.name}".`;
      const res = await fetch(`/api/crm/contacts/${encodeURIComponent(hit.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }).catch(() => null);
      if (!res?.ok) return "❌ No pude archivar el contacto. Intenta de nuevo.";
      return `✅ Contacto "${hit.name}" archivado.`;
    }

    // Notas viven en este navegador (página Notas) — igual que antes.
    case "create_note": {
      const notes = loadFromStorage<Record<string, unknown>[]>("notes", []);
      const newNote = {
        id: generateId(),
        title: action.title || "Nota sin título",
        content: action.content || "",
        pinned: false,
        tags: Array.isArray(action.tags) ? action.tags : [],
        image: "",
        createdAt: new Date().toISOString().split("T")[0],
      };
      saveToStorage("notes", [newNote, ...notes]);
      window.dispatchEvent(new StorageEvent("storage", { key: "localrank_ws_" + (localStorage.getItem("localrank_active_workspace") || "default") + "_notes" }));
      return `✅ Nota "${newNote.title}" creada.`;
    }

    default:
      return "";
  }
}

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "¡Hola, mi rey! 👋 Soy tu asistente. Pregúntame por tus citas, tareas y contactos, dame órdenes (agendar, reprogramar, crear) o mándame una nota de voz 🎙️ con lo que quieras guardar.",
      timestamp: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [grabando, setGrabando] = useState(false); // nota de voz en curso
  const [transcribiendo, setTranscribiendo] = useState(false); // Whisper trabajando
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Al cerrar/desmontar con una grabación abierta: suelta el micrófono.
  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      try { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); } catch {}
    };
  }, []);

  /**
   * Nota de voz REAL: MediaRecorder → Whisper (/api/vault/transcribe).
   * Se dejó de usar Web Speech (webkitSpeechRecognition): en iPhone la 2.ª
   * sesión "escuchaba" pero no transcribía nada — audio session trabada.
   * Con Whisper la transcripción llega del servidor: funciona igual en
   * Safari, PWA instalada y desktop. Límite del server: 4.5 MB (~4 min).
   */
  const toggleNotaVoz = useCallback(async () => {
    if (transcribiendo) return;
    const rec = recorderRef.current;
    if (grabando && rec && rec.state === "recording") {
      // Corte manual: para, sube el audio y el texto cae en el input.
      rec.stop();
      return;
    }
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      alert("Tu navegador no soporta notas de voz. Escríbeme o actualiza Safari/Chrome.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("No pude usar el micrófono. En Ajustes del iPhone → DuqueLabs → permite el micrófono.");
      return;
    }
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t)
    );
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      recorderRef.current = null;
      setGrabando(false);

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/mp4" });
      if (blob.size < 500) {
        setInput((prev) => prev); // tapada al instante: casi seguro no habló
        return;
      }
      if (blob.size > 4_400_000) {
        alert("La nota salió muy larga (máx ~4 min). Grábala en dos partes.");
        return;
      }
      setTranscribiendo(true);
      const fd = new FormData();
      const ext = (recorder.mimeType || "audio/mp4").includes("mp4") ? "m4a" : "webm";
      fd.append("file", blob, `nota.${ext}`);
      const res = await fetch("/api/vault/transcribe", { method: "POST", body: fd }).catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => null) : null;
      setTranscribiendo(false);
      if (data?.transcript) {
        const texto = String(data.transcript).trim();
        setInput((prev) => (prev ? `${prev} ${texto}` : texto));
      } else {
        // Error VISIBLE en el chat (una alerta en el teléfono se pasa por alto).
        const motivo =
          res && !res.ok
            ? ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message
            : null;
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            role: "assistant",
            content: `🎙️ No pude transcribir tu nota. ${motivo ?? "Intenta de nuevo en unos segundos."}`,
            timestamp: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setGrabando(true);
    // Tope de 3.5 min: corta solo para no pasarse del límite del server.
    autoStopRef.current = setTimeout(() => {
      try { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); } catch {}
    }, 210_000);
  }, [grabando, transcribiendo]);

  async function send() {
    // Grabando → el envío corta la nota y la manda a transcribir; el texto
    // cae en el input y el usuario lo revisa y envía de verdad.
    if (grabando) {
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") rec.stop();
      return;
    }
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const crmContext = await getCrmContext();

      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, crmContext }),
      });

      let reply: string;
      let actionNote = "";

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        reply = err?.error?.message ?? "Hubo un error. Intenta de nuevo.";
      } else {
        const data = await res.json();
        reply = data.text;
        // Execute action if the AI returned one
        if (data.action && typeof data.action === "object") {
          actionNote = await executeAction(data.action as Record<string, unknown>);
          if (actionNote) reply = `${reply}\n\n${actionNote}`;
        }
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: reply,
        timestamp: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Error de conexión. Verifica tu internet e intenta de nuevo.",
        timestamp: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
      }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed bottom-[calc(84px+var(--safe-bottom))] right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 md:bottom-4 md:h-12 md:w-12" title="Asistente IA">
        <Sparkles className="h-4 w-4 md:h-5 md:w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#eef1f6] shadow-2xl dark:bg-gray-950 md:bottom-6 md:right-6 md:h-[560px] md:w-[400px] md:rounded-[26px] md:border">
      {/* Header estilo Telegram: avatar, nombre, en línea */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-brand to-[#053680] px-4 py-3">
        <div className="relative">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
            <Bot className="h-5 w-5 text-white" />
          </span>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-brand bg-[#34c759]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-white">Tu asistente</p>
          <p className="text-[11px] font-medium text-white/75">en línea · IA de tu CRM</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/15 hover:text-white active:scale-90">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Mensajes estilo Telegram */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        <div className="mb-3 text-center">
          <span className="rounded-full bg-black/8 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground dark:bg-white/10">
            Hoy
          </span>
        </div>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-end gap-1.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <span className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[#053680] text-white shadow-sm">
                <Bot className="h-3.5 w-3.5" />
              </span>
            )}
            <div
              className={`ios-fade-enter max-w-[82%] px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-brand to-[#0856cc] text-white"
                  : "rounded-[20px] rounded-bl-[6px] border bg-white text-foreground dark:bg-gray-800 dark:border-gray-700"
              }`}
            >
              <p className="whitespace-pre-wrap">
                {msg.content.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
              </p>
              <p className={`mt-1 text-right text-[9px] font-medium ${msg.role === "user" ? "text-white/70" : "text-muted-foreground"}`}>
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-1.5">
            <span className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[#053680] text-white shadow-sm">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-1 rounded-[20px] rounded-bl-[6px] border bg-white px-4 py-3 shadow-sm dark:bg-gray-800">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Sugerencias */}
      {messages.length <= 2 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="rounded-full border bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-brand shadow-sm transition-transform active:scale-95 dark:bg-gray-800/80"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Barra de entrada estilo Telegram */}
      <div className="border-t border-black/5 bg-white/70 px-3 py-2.5 backdrop-blur dark:border-white/10 dark:bg-gray-900/70">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={grabando ? "🎙️ Grabando tu nota…" : transcribiendo ? "✍️ Transcribiendo…" : "Mensaje"}
            disabled={loading}
            className={`min-h-[44px] flex-1 rounded-full border bg-background px-4 text-sm focus:border-brand focus:outline-none disabled:opacity-50 ${
              grabando ? "border-[#ff3b30] ring-2 ring-[#ff3b30]/30" : ""
            }`}
          />
          <button
            onClick={toggleNotaVoz}
            type="button"
            aria-label={grabando ? "Terminar la nota y transcribir" : "Grabar nota de voz"}
            disabled={transcribiendo}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-40 ${
              grabando ? "animate-pulse bg-[#ff3b30] text-white shadow-lg shadow-red-500/30" : "text-muted-foreground hover:bg-muted hover:text-brand"
            }`}
          >
            {grabando ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            id="ai-send-btn"
            onClick={send}
            title={grabando ? "Terminar la nota y transcribir" : transcribiendo ? "Transcribiendo…" : "Enviar"}
            disabled={loading || transcribiendo || (!input.trim() && !grabando)}
            aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[#0856cc] text-white shadow-md transition-transform active:scale-90 disabled:opacity-40"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
