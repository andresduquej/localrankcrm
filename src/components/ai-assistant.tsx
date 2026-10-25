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

/** Collect CRM data from localStorage to send as context to the AI. */
function getCrmContext(): Record<string, unknown> {
  return {
    contacts: loadFromStorage("contacts", []),
    pipelineStages: loadFromStorage("pipeline_stages", []),
    pipelineLeads: loadFromStorage("pipeline_leads", []),
    inboxConversations: loadFromStorage("inbox_conversations", []),
    calendarAppointments: loadFromStorage("calendar_appointments", []),
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
    tasks: loadFromStorage("tasks", []),
    suppliers: loadFromStorage("suppliers", []),
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
      content: "¡Hola, mi rey! 👋 Soy tu asistente. Pregúntame lo que quieras de tu CRM o díctame órdenes: crear tareas, contactos, notas…",
      timestamp: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<unknown>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Mata la instancia de reconocimiento: sin esto, el segundo uso falla
   *  en silencio (InvalidStateError) — iOS/iPhone especialmente. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matarReconocimiento = (rec: any) => {
    if (!rec) return;
    try { rec.onstart = null; rec.onresult = null; rec.onend = null; rec.onerror = null; } catch {}
    try { rec.stop(); } catch {}
    try { rec.abort(); } catch {}
  };

  const toggleVoice = useCallback(() => {
    if (listening) {
      // Corte manual: el texto transcrito YA quedó en el input; el usuario
      // lo edita o envía con el botón. El estado se libera siempre.
      matarReconocimiento(recognitionRef.current);
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    // Limpia restos de una sesión previa antes de empezar (uso #2, #3…)
    matarReconocimiento(recognitionRef.current);
    recognitionRef.current = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta reconocimiento de voz. Prueba en Safari/Chrome actualizado.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "es-CO";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    // Base confirmada + interino: evita duplicar texto al reenviar resultados
    let confirmado = "";

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      // Fin natural del audio: el estado se libera (la instancia se
      // recrea en el próximo uso — reutilizarla es lo que se pega).
      setListening(false);
    };
    recognition.onerror = (e: unknown) => {
      setListening(false);
      const err = e as Record<string, unknown>;
      if (err.error === "not-allowed") {
        alert("Permiso de micrófono denegado. En Ajustes del iPhone → DuqueLabs (o Safari) → permite el micrófono.");
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interino = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) confirmado += r[0].transcript + " ";
        else interino += r[0].transcript;
      }
      setInput((confirmado + interino).trim());
      // El envío lo decide el usuario: nada de clics automáticos.
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // "already started": aborta la zombie y reintenta una vez, fresca
      matarReconocimiento(recognition);
      const reintento = recognition;
      setTimeout(() => {
        try {
          reintento.start();
        } catch {
          setListening(false);
        }
      }, 350);
    }
  }, [listening]);

  async function send() {
    // Escuchando → cortar el micrófono: lo transcrito queda en el input
    // y este envío ya lo manda (como pediste el botón nunca queda pegado).
    if (listening) {
      matarReconocimiento(recognitionRef.current);
      recognitionRef.current = null;
      setListening(false);
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

      const crmContext = getCrmContext();

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
            placeholder={listening ? "🎙️ Escuchando…" : "Mensaje"}
            disabled={loading}
            className={`min-h-[44px] flex-1 rounded-full border bg-background px-4 text-sm focus:border-brand focus:outline-none disabled:opacity-50 ${
              listening ? "border-brand ring-2 ring-brand/30" : ""
            }`}
          />
          <button
            onClick={toggleVoice}
            type="button"
            aria-label={listening ? "Detener dictado" : "Dictar"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
              listening ? "animate-pulse bg-[#ff3b30] text-white shadow-lg shadow-red-500/30" : "text-muted-foreground hover:bg-muted hover:text-brand"
            }`}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            id="ai-send-btn"
            onClick={send}
            title={listening ? "Dejar de escuchar y enviar" : "Enviar"}
            disabled={loading || (!input.trim() && !listening)}
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
