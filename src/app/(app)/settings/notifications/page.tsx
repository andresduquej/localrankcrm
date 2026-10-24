"use client";
import { useEffect, useState } from "react";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Copy,
  Hourglass,
  Monitor,
  Send,
  Smartphone,
  Volume2,
} from "lucide-react";
import {
  loadNotifyPrefs,
  notifyUser,
  requestNotifyPermission,
  saveNotifyPrefs,
  DEFAULT_NOTIFY_PREFS,
  type NotifyPrefs,
} from "@/lib/notifications";
import {
  enablePushOnThisDevice,
  pushDeviceStatus,
  type PushDeviceStatus,
} from "@/components/push-register";

const PERMISSION_LABELS: Record<NotificationPermission, string> = {
  granted: "Concedido",
  default: "Sin decidir",
  denied: "Bloqueado",
};

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setPrefs(loadNotifyPrefs());
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, []);

  function update(next: Partial<NotifyPrefs>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    saveNotifyPrefs(merged);
  }

  async function handleRequestPermission() {
    const result = await requestNotifyPermission();
    setPermission(result);
  }

  function handleTest() {
    const sent = notifyUser({ title: "DuqueLabs", body: "Así se ve una notificación 👋" });
    setFeedback(
      sent
        ? { ok: true, msg: "Notificación enviada" }
        : { ok: false, msg: "Activa primero las notificaciones y concede el permiso" }
    );
    setTimeout(() => setFeedback(null), 3000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Notificaciones</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige cómo quieres recibir los avisos del CRM en este navegador.
        </p>
      </div>

      {/* Preferencias */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <h4 className="mb-4 flex items-center gap-2 font-medium">
          <Bell className="h-4 w-4" />
          Preferencias
        </h4>
        <div className="divide-y">
          <Row
            icon={<Monitor className="h-4 w-4" />}
            title="Notificaciones en pantalla"
            description="Muestra avisos del sistema incluso con la pestaña en segundo plano."
            toggle={<Toggle checked={prefs.enabled} onChange={(v) => update({ enabled: v })} />}
          />
          <Row
            icon={<Volume2 className="h-4 w-4" />}
            title="Sonido"
            description="Beep corto al llegar una notificación."
            disabled={!prefs.enabled}
            toggle={<Toggle checked={prefs.sound} disabled={!prefs.enabled} onChange={(v) => update({ sound: v })} />}
          />
          <Row
            icon={<Smartphone className="h-4 w-4" />}
            title="Vibración"
            description="Vibra en dispositivos compatibles (móviles)."
            disabled={!prefs.enabled}
            toggle={<Toggle checked={prefs.vibration} disabled={!prefs.enabled} onChange={(v) => update({ vibration: v })} />}
          />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Preferencia personal de este navegador. Se guardan al instante, no hace falta guardar.
        </p>
      </div>

      {/* Permiso del navegador */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="flex items-center gap-2 font-medium">
              <BellRing className="h-4 w-4" />
              Permiso del navegador
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Estado actual:{" "}
              <span
                className={
                  permission === "granted"
                    ? "font-semibold text-green-600"
                    : permission === "denied"
                      ? "font-semibold text-red-500"
                      : "font-semibold text-amber-600"
                }
              >
                {PERMISSION_LABELS[permission]}
              </span>
            </p>
          </div>
          {permission === "granted" ? (
            <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Listo
            </span>
          ) : (
            <button
              onClick={handleRequestPermission}
              disabled={permission === "denied"}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Activar permiso
            </button>
          )}
        </div>
        {permission === "denied" && (
          <p className="mt-3 text-xs text-amber-600">
            El permiso está bloqueado. Actívalo desde el candado de la barra de direcciones del navegador.
          </p>
        )}
      </div>

      {/* Probar */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
        <h4 className="font-medium">Probar</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Envía una notificación de prueba con tu sonido y vibración configurados.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleTest}
            className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            <Send className="h-3.5 w-3.5" />
            Enviar notificación de prueba
          </button>
          {feedback && (
            <span className={`text-xs font-medium ${feedback.ok ? "text-green-600" : "text-amber-600"}`}>
              {feedback.msg}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        En iPhone, instala la app (Compartir → Agregar a pantalla de inicio) y requiere iOS 16.4+ para
        poder conceder permisos de notificación.
      </p>

      <PushCard />
      <PingCard />
    </div>
  );
}

/** Card: push nativo al dispositivo (iPhone/Android/navegador). */
function PushCard() {
  const [estado, setEstado] = useState<PushDeviceStatus | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    pushDeviceStatus().then(setEstado).catch(() => setEstado(null));
  }, []);

  async function activar() {
    setOcupado(true);
    const res = await enablePushOnThisDevice().catch(() => ({
      ok: false,
      message: "No se pudo activar el push en este dispositivo",
    }));
    setOcupado(false);
    setFeedback({ ok: res.ok, msg: res.message });
    setTimeout(() => setFeedback(null), 5000);
    pushDeviceStatus().then(setEstado).catch(() => {});
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
      <h4 className="flex items-center gap-2 font-medium">
        <Smartphone className="h-4 w-4" />
        Notificaciones push (iPhone/Android)
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Avisos de citas y tareas vencidas directo en la pantalla de bloqueo, aunque no tengas
        la app abierta. Requiere la app instalada (Compartir → Agregar a pantalla de inicio)
        e iOS 16.4+.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={activar}
          disabled={ocupado || estado?.supported === false}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ocupado ? "Activando…" : "Activar push en este dispositivo"}
        </button>
        {feedback && (
          <span className={`text-xs font-medium ${feedback.ok ? "text-green-600" : "text-amber-600"}`}>
            {feedback.msg}
          </span>
        )}
        {!feedback && estado?.subscribed && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Este dispositivo ya recibe push
          </span>
        )}
      </div>
      {estado?.supported === false && (
        <p className="mt-3 text-xs text-amber-600">
          Este navegador no soporta push web. En iPhone: abre la app instalada (no Safari
          normal) para activarlo.
        </p>
      )}
    </div>
  );
}

/** Card: ping externo cada hora para el modo fastidio. */
function PingCard() {
  const [pingUrl, setPingUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch("/api/settings/telegram")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const secret = d?.connection?.webhookSecret;
        if (secret && typeof window !== "undefined") {
          setPingUrl(`${window.location.origin}/api/cron/reminders?org=${secret}&digest=1`);
        }
      })
      .catch(() => {});
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pingUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // clipboard bloqueado: el usuario puede copiar a mano
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-700">
      <h4 className="flex items-center gap-2 font-medium">
        <Hourglass className="h-4 w-4" />
        Fastidio cada hora (ping externo)
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        El plan gratis de Vercel despierta el bot 1 vez al día. Para que te fastidie las tareas
        cada hora, crea un cron gratis en cron-job.org que pegue esta URL:
      </p>
      {pingUrl ? (
        <>
          <code className="mt-3 block max-h-20 overflow-y-auto break-all rounded-lg bg-muted px-3 py-2 text-[11px]">
            {pingUrl}
          </code>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={copiar}
              className="flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiado ? "¡Copiada!" : "Copiar URL"}
            </button>
            <a
              href="https://cron-job.org/en/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand hover:underline"
            >
              Abrir cron-job.org →
            </a>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Crea cuenta gratis en cron-job.org y dale “Create cronjob”.</li>
            <li>Pega la URL copiada en el campo “URL”.</li>
            <li>En Schedule elige “Every 1 hour” y guarda. Listo.</li>
          </ol>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Conecta primero el bot de Telegram (Ajustes → Telegram) para generar tu URL de ping.
        </p>
      )}
    </div>
  );
}

/** Fila de preferencia: icono + título/descripción a la izquierda, toggle a la derecha */
function Row({
  icon,
  title,
  description,
  toggle,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  toggle: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3.5 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {toggle}
    </div>
  );
}

/** Switch estilo iOS con el patrón peer del repo */
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex shrink-0 items-center ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-brand/20 peer-disabled:opacity-60" />
    </label>
  );
}
