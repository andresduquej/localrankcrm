import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Whitelist de columnas editables (.strict() bloquea id/organizationId/…). */
const putSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(100_000).optional(),
    priority: z.string().max(20).optional(),
    status: z.string().max(30).optional(),
    dueDate: z.string().max(30).optional(),
    assignee: z.string().max(200).optional(),
    relatedTo: z.string().max(200).optional(),
    category: z.string().max(120).optional(),
    tags: z.array(z.unknown()).max(100).optional(),
    done: z.boolean().optional(),
  })
  .strict();

export const PUT = withAuth(async (session, req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  const updated = await db
    .update(schema.crmTask)
    .set({ ...body.data, updatedAt: new Date() })
    .where(and(eq(schema.crmTask.id, id), eq(schema.crmTask.organizationId, session.organizationId)))
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Tarea no encontrada");
  return Response.json({ ok: true, task: updated[0] });
});

export const DELETE = withAuth(async (session, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = getDb();
  await db.delete(schema.crmTask).where(and(eq(schema.crmTask.id, id), eq(schema.crmTask.organizationId, session.organizationId)));
  return Response.json({ ok: true });
});
