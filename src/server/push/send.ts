import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Envío de notificaciones Web Push por organización (iPhone/navegador).
 *
 * Feature flag silencioso: si no hay llaves VAPID en el entorno, no envía
 * nada ni lanza — la app funciona igual sin push.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Ruta interna a abrir al tocar la notificación (ej. "/calendar"). */
  url?: string;
  /** Agrupa notificaciones: la última reemplaza a las anteriores con el mismo tag. */
  tag?: string;
};

const VAPID_SUBJECT = "mailto:andresduquepancake@gmail.com";

type VapidKeys = { publicKey: string; privateKey: string };

/** Llaves VAPID del entorno; null si la feature no está configurada. */
function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

/** Payload JSON que consume el service worker (public/sw.js). Puro, para tests. */
export function buildPushPayload(payload: PushPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    ...(payload.url ? { url: payload.url } : {}),
    ...(payload.tag ? { tag: payload.tag } : {}),
  });
}

/**
 * Envía un push a todas las suscripciones de la organización.
 * Nunca lanza: los fallos por suscripción se registran y, si el navegador
 * reporta la suscripción muerta (404/410), se elimina de la BD.
 * Devuelve cuántos pushes se enviaron con éxito.
 */
export async function sendPushToOrg(
  organizationId: string,
  payload: PushPayload
): Promise<number> {
  const vapid = vapidKeys();
  if (!vapid) return 0;

  const db = getDb();
  const subs = await db
    .select()
    .from(schema.pushSubscription)
    .where(eq(schema.pushSubscription.organizationId, organizationId));
  if (subs.length === 0) return 0;

  const body = buildPushPayload(payload);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.keysP256dh, auth: s.keysAuth },
        },
        body,
        { vapidDetails: { subject: VAPID_SUBJECT, ...vapid } }
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Suscripción vencida o revocada en el dispositivo: limpiar.
        await db
          .delete(schema.pushSubscription)
          .where(eq(schema.pushSubscription.id, s.id))
          .catch(() => {});
      } else {
        console.error("[push] fallo al enviar:", err);
      }
    }
  }
  return sent;
}
