import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export const dynamic = "force-dynamic";

/**
 * Alta/baja de suscripciones Web Push del usuario autenticado.
 * El endpoint es único por dispositivo: re-suscribir hace upsert.
 */

const postSchema = z.object({
  endpoint: z.string().min(1).max(500),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(300).optional(),
});

/** POST — upsert de la suscripción (por endpoint único). */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const userAgent = body.data.userAgent ?? "";
  await db
    .insert(schema.pushSubscription)
    .values({
      id: newId("pushSubscription"),
      organizationId: session.organizationId,
      userId: session.userId,
      endpoint: body.data.endpoint,
      keysP256dh: body.data.keys.p256dh,
      keysAuth: body.data.keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscription.endpoint,
      set: {
        organizationId: session.organizationId,
        userId: session.userId,
        keysP256dh: body.data.keys.p256dh,
        keysAuth: body.data.keys.auth,
        userAgent,
        updatedAt: new Date(),
      },
    });
  return Response.json({ ok: true });
});

const deleteSchema = z.object({
  endpoint: z.string().min(1).max(500),
});

/** DELETE — borra la suscripción (dentro de la organización activa). */
export const DELETE = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  await db
    .delete(schema.pushSubscription)
    .where(
      and(
        eq(schema.pushSubscription.organizationId, session.organizationId),
        eq(schema.pushSubscription.endpoint, body.data.endpoint)
      )
    );
  return Response.json({ ok: true });
});
