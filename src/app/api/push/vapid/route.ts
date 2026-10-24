import { withAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid — clave pública VAPID para que el navegador
 * se suscriba a push. Null si el servidor no tiene push configurado.
 */
export const GET = withAuth(async () => {
  return Response.json({
    publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null,
  });
});
