/**
 * Preferencias de notificación del navegador — pantalla, sonido y vibración.
 * Preferencia personal del navegador (no workspace-scoped), guardada en localStorage.
 */

export type NotifyPrefs = { enabled: boolean; sound: boolean; vibration: boolean };

export const NOTIFY_PREFS_KEY = "duquelabs_notify_prefs";

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  enabled: false,
  sound: true,
  vibration: true,
};

/** Carga las preferencias desde localStorage (SSR-safe) con merge sobre los defaults */
export function loadNotifyPrefs(): NotifyPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFY_PREFS };
  try {
    const stored = localStorage.getItem(NOTIFY_PREFS_KEY);
    if (!stored) return { ...DEFAULT_NOTIFY_PREFS };
    return { ...DEFAULT_NOTIFY_PREFS, ...(JSON.parse(stored) as Partial<NotifyPrefs>) };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

/** Guarda las preferencias en localStorage */
export function saveNotifyPrefs(prefs: NotifyPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFY_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage no disponible o lleno
  }
}

/** Pide permiso de notificación al navegador. Devuelve "denied" si la API no existe */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Beep corto doble con Web Audio API (dos tonos ~880/1320Hz, sin archivos de audio) */
function playBeep(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playTone = (freq: number, delay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    };
    // Dos tonos: ~880Hz y ~1320Hz con un pequeño delay entre ellos
    playTone(880, 0);
    playTone(1320, 0.18);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Audio no disponible en este navegador
  }
}

/**
 * Muestra una notificación en pantalla con sonido y vibración según las preferencias.
 * Devuelve false si no hay permiso o las notificaciones están desactivadas.
 */
export function notifyUser(opts: { title: string; body: string; tag?: string }): boolean {
  try {
    const prefs = loadNotifyPrefs();
    if (!prefs.enabled) return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
    new Notification(opts.title, { body: opts.body, icon: "/icon-192.png", tag: opts.tag });
    if (prefs.sound) playBeep();
    if (prefs.vibration && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([120, 60, 120]);
    }
    return true;
  } catch {
    return false;
  }
}
