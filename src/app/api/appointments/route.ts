import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { createAppointment, listAppointments } from "@/server/telegram/notify";

export const dynamic = "force-dynamic";

/** Agenda del CRM (la alimenta el bot de Telegram y la UI). */

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
