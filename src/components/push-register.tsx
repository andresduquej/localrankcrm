"use client";
import { useEffect } from "react";

/**
 * Registro de Web Push (iPhone/navegador).
 *
 * - <PushRegister/> se monta en el layout de la app: al cargar, si el
 *   permiso ya está concedido, registra /sw.js y sincroniza la suscripción
 *   con el backend. Todo silencioso (nunca promptea ni lanza).
 * - enablePushOnThisDevice() es el flujo con permiso explícito, usado por
 *   el botón de la pantalla de ajustes de notificaciones.
 */

export type PushEnableResult = { ok: boolean; message: string };

export type PushDeviceStatus = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

/** Soporte de push en este navegador (SW + Notification + PushManager). */
function pushSoportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof Notification !== "undefined" &&
    "PushManager" in window
  );
}

/** Convierte la clave pública VAPID (base64url) a Uint8Array para pushManager. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  // Buffer propio (no SharedArrayBuffer): applicationServerKey exige BufferSource
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Estado push de este dispositivo (para la UI de ajustes). */
export async function pushDeviceStatus(): Promise<PushDeviceStatus> {
  if (!pushSoportado()) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    subscribed = Boolean(await reg?.pushManager.getSubscription());
  } catch {
    subscribed = false;
  }
  return { supported: true, permission: Notification.permission, subscribed };
}

/**
 * Flujo completo de alta push en este dispositivo: permiso → service worker
 * → suscripción → POST /api/push/subscribe. Nunca lanza; devuelve feedback.
 */
export async function enablePushOnThisDevice(): Promise<PushEnableResult> {
  try {
    if (!pushSoportado()) {
      return { ok: false, message: "Este navegador no soporta notificaciones push" };
    }
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      return { ok: false, message: "El permiso de notificaciones no está concedido" };
    }
    const res = await fetch("/api/push/vapid");
    if (!res.ok) return { ok: false, message: "No se pudo leer la configuración push" };
    const data = (await res.json()) as { publicKey: string | null };
    if (!data.publicKey) {
      return { ok: false, message: "El servidor no tiene push configurado (faltan llaves VAPID)" };
    }

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
    }
    const raw = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
      return { ok: false, message: "La suscripción del navegador llegó incompleta" };
    }

    const post = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: raw.endpoint,
        keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
        userAgent: navigator.userAgent.slice(0, 300),
      }),
    });
    if (!post.ok) return { ok: false, message: "No se pudo registrar la suscripción" };
    return { ok: true, message: "Push activado en este dispositivo" };
  } catch {
    return { ok: false, message: "No se pudo activar el push en este dispositivo" };
  }
}

/**
 * Registro silencioso al montar: solo actúa si el permiso ya fue concedido
 * (no promptea). Idempotente: re-suscribir hace upsert en el backend.
 */
export default function PushRegister() {
  useEffect(() => {
    void (async () => {
      try {
        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        await enablePushOnThisDevice();
      } catch {
        // Silencioso: el push nunca debe romper la carga de la app.
      }
    })();
  }, []);
  return null;
}
