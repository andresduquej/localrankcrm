import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createAppointment, listAppointments } from "@/server/telegram/notify";

export const dynamic = "force-dynamic";

/** Agenda del CRM (la alimenta el bot de Telegram, la UI y el asistente). */

export const GET = withAuth(async (session) => {
  const rows = await listAppointments(session.organizationId, {
    limit: 50,
    includeDone: true,
  });
  return Response.json({ appointments: rows });
});

const postSchema = z.object({
  title: z.string().trim().min(1).max(300),
  startsAt: z.string().datetime(),
  notes: z.string().max(2000).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const created = await createAppointment({
    organizationId: session.organizationId,
    title: body.data.title,
    startsAt: new Date(body.data.startsAt),
    notes: body.data.notes,
    source: "api",
  });
  return Response.json({ ok: true, appointment: created }, { status: 201 });
});

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(300).optional(),
  startsAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  done: z.boolean().optional(),
});

/** PATCH — reprograma/edita/marca-hecha una cita (asistente y Agenda). */
export const PATCH = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const { id, ...campos } = body.data;
  const cambios: Record<string, unknown> = {};
  if (campos.title !== undefined) cambios.title = campos.title;
  if (campos.notes !== undefined) cambios.notes = campos.notes;
  if (campos.startsAt !== undefined) cambios.startsAt = new Date(campos.startsAt);
  if (campos.done !== undefined) cambios.completedAt = campos.done ? new Date() : null;
  if (Object.keys(cambios).length === 0) {
    return apiError(422, "nothing_to_update", "No llegó nada que cambiar (title/startsAt/notes)");
  }

  const db = getDb();
  const actualizadas = await db
    .update(schema.appointment)
    .set(cambios)
    .where(
      and(
        eq(schema.appointment.id, id),
        eq(schema.appointment.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!actualizadas[0]) {
    return apiError(404, "not_found", "No encontré esa cita");
  }
  return Response.json({ ok: true, appointment: actualizadas[0] });
});

/** DELETE — borra una cita de la organización (?id=). */
export const DELETE = withAuth(async (session, req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError(422, "missing_id", "Falta ?id=");
  const db = getDb();
  const borradas = await db
    .delete(schema.appointment)
    .where(
      and(
        eq(schema.appointment.id, id),
        eq(schema.appointment.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!borradas[0]) {
    return apiError(404, "not_found", "No encontré esa cita");
  }
  return Response.json({ ok: true });
});
