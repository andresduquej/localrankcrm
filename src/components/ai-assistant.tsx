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
  "¿Cuántos contactos tengo?",
  "Crea un contacto: Juan Pérez, 3001234567",
  "¿Cómo va el pipeline?",
  "Crea una tarea: Llamar a cliente mañana",
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

/** Execute an action returned by the AI agent */
function executeAction(action: Record<string, unknown>): string {
  const type = action.type as string;

  switch (type) {
    case "create_contact": {
      const contacts = loadFromStorage<Record<string, unknown>[]>("contacts", []);
      const newContact = {
        id: generateId(),
        name: action.name || "",
        phone: action.phone || "",
        email: action.email || "",
        company: action.company || "",
        role: action.role || "",
        image: "",
        archived: false,
        tags: Array.isArray(action.tags) ? action.tags : [],
        createdAt: new Date().toISOString().split("T")[0],
        customFields: [],
        notes: [],
        reminders: [],
      };
      saveToStorage("contacts", [newContact, ...contacts]);
      window.dispatchEvent(new StorageEvent("storage", { key: "localrank_ws_" + (localStorage.getItem("localrank_active_workspace") || "default") + "_contacts" }));
      return `✅ Contacto "${newContact.name}" creado exitosamente.`;
    }

    case "create_task": {
      const tasks = loadFromStorage<Record<string, unknown>[]>("tasks", []);
      const newTask = {
        id: generateId(),
        title: action.title || "",
        done: false,
        priority: action.priority || "media",
        dueDate: action.dueDate || "",
        assignee: action.assignee || "",
        tags: Array.isArray(action.tags) ? action.tags : [],
        createdAt: new Date().toISOString().split("T")[0],
      };
      saveToStorage("tasks", [newTask, ...tasks]);
      // Dispatch storage event so the Tasks page re-renders if open
      window.dispatchEvent(new StorageEvent("storage", { key: "localrank_ws_" + (localStorage.getItem("localrank_active_workspace") || "default") + "_tasks" }));
      return `✅ Tarea "${newTask.title}" creada.`;
    }

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

    case "create_lead": {
      const leads = loadFromStorage<Record<string, unknown>[]>("pipeline_leads", []);
      const stages = loadFromStorage<Record<string, unknown>[]>("pipeline_stages", []);
      const stageId = (action.stageId as string) || stages[0]?.id as string || "s1";
      const newLead = {
        id: generateId(),
        name: action.name || "",
        company: action.company || "",
        value: action.value || "$0",
        stageId,
      };
      saveToStorage("pipeline_leads", [newLead, ...leads]);
      return `✅ Lead "${newLead.name}" agregado al pipeline.`;
    }

    case "create_company": {
      const companies = loadFromStorage<Record<string, unknown>[]>("companies", []);
      const newCompany = {
        id: generateId(),
        name: action.name || "",
        industry: action.industry || "",
        phone: action.phone || "",
        website: action.website || "",
        city: action.city || "",
        country: action.country || "",
        employees: action.employees || "",
        notes: [],
        customFields: [],
        createdAt: new Date().toISOString().split("T")[0],
      };
      saveToStorage("companies", [newCompany, ...companies]);
      return `✅ Compañía "${newCompany.name}" creada.`;
    }

    case "archive_contact": {
      const contacts = loadFromStorage<Record<string, unknown>[]>("contacts", []);
      const name = (action.name as string || "").toLowerCase();
      const updated = contacts.map(c =>
        (c.name as string || "").toLowerCase().includes(name) ? { ...c, archived: true } : c
      );
      const found = updated.some((c, i) => c.archived !== contacts[i]?.archived);
      if (found) {
        saveToStorage("contacts", updated);
        return `✅ Contacto archivado.`;
      }
      return `No encontré un contacto con ese nombre para archivar.`;
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

  const toggleVoice = useCallback(() => {
    if (listening) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any)?.stop?.();
      setListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Tu navegador no soporta reconocimiento de voz. Usa Google Chrome o Microsoft Edge.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "es-CO";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (e: unknown) => {
      setListening(false);
      const err = e as Record<string, unknown>;
      if (err.error === "not-allowed") {
        alert("Permiso de micrófono denegado. Haz clic en el ícono de candado en la barra de direcciones y permite el micrófono.");
      } else if (err.error === "no-speech") {
        setInput("(No se detectó voz. Intenta de nuevo)");
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
      // Auto-send on final result
      const lastResult = event.results[event.results.length - 1];
      if (lastResult?.isFinal) {
        setTimeout(() => {
          const btn = document.getElementById("ai-send-btn");
          if (btn) btn.click();
        }, 400);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      alert("Error al iniciar el micrófono. Asegúrate de estar en HTTPS y que el navegador sea Chrome o Edge.");
    }
  }, [listening]);

  async function send() {
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
        reply = res.status === 503
          ? "⚠️ El asistente IA no está configurado. Agrega GEMINI_API_KEY o OPENROUTER_API_TOKEN en las variables de entorno."
          : err?.error?.message ?? "Hubo un error. Intenta de nuevo.";
      } else {
        const data = await res.json();
        reply = data.text;
        // Execute action if the AI returned one
        if (data.action && typeof data.action === "object") {
          actionNote = executeAction(data.action as Record<string, unknown>);
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
            disabled={!input.trim() || loading}
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
