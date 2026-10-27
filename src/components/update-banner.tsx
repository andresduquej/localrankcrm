"use client";

import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";

const CURRENT_VERSION = "2.4.2";
const UPDATES = [
  { version: "2.4.2", date: "26 Oct 2026", title: "Asistente arreglado de fondo: ve tu agenda real, reprograma y notas de voz", highlights: ["El asistente ahora lee tu agenda, tareas y contactos REALES de la base de datos", "NUEVO: pídele reprogramar («pásala al martes 4pm») y la mueve de verdad", "NUEVO: nota de voz con Whisper — toca el micrófono, habla, toca de nuevo y el texto cae en el mensaje", "La Agenda guarda en la base de datos: lo que creas ahí lo ven el bot, el Hoy y los recordatorios", "Horas siempre en hora de Colombia (antes se corrían 5 horas)", "Si algo falla, el chat te dice exactamente por qué"] },
  { version: "2.4.1", date: "24 Oct 2026", title: "Modo personal: tu CRM limpio de 6 destinos", highlights: ["Menú personal por defecto: Hoy, Agenda, Tareas, Bóveda, Bóveda de ideas y Contactos", "Los 47 módulos enterprise no se borran: viven en «Más» (móvil) y «Ver todos los módulos» (desktop)", "Cámbialo cuando quieras en Ajustes → Apariencia → Modo personal"] },
  { version: "2.4.0", date: "24 Oct 2026", title: "DuqueLabs: Mayordomo de tareas + Bóveda + Push al iPhone + IA multi-proveedor", highlights: ["Nueva marca: DuqueLabs (ícono y nombre en tu teléfono)", "Mayordomo por Telegram: /tarea, /pendientes, /listo — pide el tiempo y te fastidia cada 2h hasta que hagas la tarea 😐→😠→🤬", "Tareas de hoy reales en el Inicio (click las marca hechas)", "Bóveda: guarda repos de GitHub (con estrellas, actividad y releases), páginas y herramientas — e importa tus favoritos de Chrome", "Notificaciones push al iPhone (pantalla de bloqueo) para citas y tareas vencidas", "Fastidio cada hora con ping externo (URL lista en Ajustes → Notificaciones)", "Configura tu IA en la app: OpenRouter, GROQ gratis, NVIDIA gratis, OpenAI, DeepSeek y más — llaves cifradas", "Endpoint de Hermes listo y guardado (planeación)"] },
  { version: "2.3.0", date: "27 Jul 2026", title: "Calendario Mes/Semana/Día + Editor Rico + Reordenar + Mobile", highlights: ["Calendario con 3 vistas: Mes, Semana y Día (timeline por horas)", "Editor de texto enriquecido en Notas, Proyectos y Tareas (negrita, itálica, links, listas, código)", "Reordenar items con ↑↓ en Checklists, Proyectos y Propuestas", "Mobile mejorado: Radar, Scout, Contactos, Compañías, Calendario, Workspace", "Checklists: items con flechas de prioridad", "Propuestas: secciones reordenables"] },
  { version: "2.2.0", date: "27 Jul 2026", title: "Agente IA con acciones + Voz + Google Login + Backup diario", highlights: ["Agente IA ejecuta acciones: crear contactos, tareas, notas, leads por voz o texto", "Input por micrófono (Web Speech API) en el asistente", "Login con Google OAuth — seguridad y acceso protegido", "Backup reminder diario a las 7pm con notificación", "Paginación en todos los módulos (Contactos, Pipeline, Cartera, Inbox, Projects, etc.)", "Etiquetas en contactos con filtro dropdown", "Social Outreach: importar CSV + edición inline", "Agente IA con acceso a TODOS los módulos del CRM", "Documentación actualizada con todas las funcionalidades"] },
  { version: "2.1.0", date: "20 Jul 2026", title: "Suscripciones, Meeting Reminders IA, Cotizador IA", highlights: ["Módulo de suscripciones y pagos recurrentes", "Meeting Reminders con IA (genera mensajes + sugiere timing)", "Cotizador de propuestas con IA", "Menú reorganizado por categorías colapsables", "50+ módulos disponibles"] },
  { version: "2.0.5", date: "20 Jul 2026", title: "Lead Finder B2B, Email Tools, Social Outreach", highlights: ["Localizador de leads con búsqueda IA", "Email Finder + Verificador + Escritor IA + Limpiar listas", "Social Outreach multicanal (LinkedIn/Twitter/Instagram/FB/TikTok)"] },
  { version: "2.0.4", date: "20 Jul 2026", title: "Workspace aislados, Archivos & IA, Focus", highlights: ["Cada workspace tiene datos independientes", "Importar archivos y preguntarle a la IA", "Modo Pomodoro con timer y estadísticas"] },
];

export function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem("localrank_update_dismissed");
    if (dismissed !== CURRENT_VERSION) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem("localrank_update_dismissed", CURRENT_VERSION);
  }

  if (!visible) return null;

  return (
    <>
      {/* Banner */}
      <div className="fixed top-3 left-16 md:left-[260px] z-[60] max-w-sm animate-in slide-in-from-top">
        <div className="rounded-lg border bg-white shadow-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 shrink-0">
              <Sparkles className="h-4 w-4 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">Actualización v{CURRENT_VERSION}</p>
              <p className="text-[10px] text-muted-foreground truncate">{UPDATES[0]?.title}</p>
            </div>
            <button onClick={() => setShowDetails(true)} className="rounded px-2 py-1 text-[10px] font-medium text-brand hover:bg-brand/5 shrink-0">Ver</button>
            <button onClick={dismiss} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-gray-100 shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      {/* Details modal */}
      {showDetails && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-20 bg-black/30" onClick={() => setShowDetails(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl mx-4 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" />Novedades</h3>
              <button onClick={() => { setShowDetails(false); dismiss(); }} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              {UPDATES.map(update => (
                <div key={update.version} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-brand">v{update.version}</span>
                    <span className="text-[10px] text-muted-foreground">{update.date}</span>
                  </div>
                  <p className="text-xs font-medium mb-2">{update.title}</p>
                  <ul className="space-y-1">
                    {update.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                        <span className="text-green-500 shrink-0 mt-0.5">✓</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.reload()} className="w-full mt-4 rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-hover">Actualizar ahora</button>
            <button onClick={() => { setShowDetails(false); dismiss(); }} className="w-full mt-1.5 text-[11px] text-muted-foreground">Entendido, después</button>
          </div>
        </div>
      )}
    </>
  );
}
