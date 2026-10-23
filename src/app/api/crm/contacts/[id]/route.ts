import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Whitelist de columnas editables: .strict() rechaza cualquier otra clave
 * (id, organizationId, createdAt…), evitando mass assignment.
 */
const putSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().max(320).optional(),
    company: z.string().max(200).optional(),
    role: z.string().max(120).optional(),
    image: z.string().max(1_000_000).optional(),
    archived: z.boolean().optional(),
    tags: z.array(z.unknown()).max(100).optional(),
    customFields: z.array(z.unknown()).max(100).optional(),
    notes: z.array(z.unknown()).max(500).optional(),
    reminders: z.array(z.unknown()).max(500).optional(),
  })
  .strict();

export const PUT = withAuth(async (session, req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const updated = await db
    .update(schema.crmContact)
    .set({ ...body.data, updatedAt: new Date() })
    .where(and(eq(schema.crmContact.id, id), eq(schema.crmContact.organizationId, session.organizationId)))
    .returning();

  if (!updated[0]) return apiError(404, "not_found", "Contacto no encontrado");
  return Response.json({ ok: true, contact: updated[0] });
});

export const DELETE = withAuth(async (session, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = getDb();
  await db
    .delete(schema.crmContact)
    .where(and(eq(schema.crmContact.id, id), eq(schema.crmContact.organizationId, session.organizationId)));
  return Response.json({ ok: true });
});
