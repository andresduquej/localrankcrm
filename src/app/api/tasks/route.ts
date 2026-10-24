import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { createTask, listPendingTasks } from "@/server/telegram/tasks";

export const dynamic = "force-dynamic";

/** Tareas del mayordomo (las crean el bot de Telegram y esta API). */

export const GET = withAuth(async (session) => {
  const tasks = await listPendingTasks(session.organizationId, 50);
  return Response.json({ tasks });
});

const postSchema = z.object({
  title: z.string().trim().min(1).max(300),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  dueDate: z.string().datetime().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const created = await createTask({
    organizationId: session.organizationId,
    title: body.data.title,
    priority: body.data.priority,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : null,
  });
  return Response.json({ ok: true, task: created }, { status: 201 });
});

const patchSchema = z.object({
  id: z.string().min(1),
  done: z.boolean(),
});

export const PATCH = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  const rows = await db
    .update(schema.crmTask)
    .set({
      done: body.data.done,
      status: body.data.done ? "done" : "pending",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.crmTask.id, body.data.id),
        eq(schema.crmTask.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!rows[0]) {
    return Response.json(
      { error: { code: "not_found", message: "Tarea no encontrada" } },
      { status: 404 }
    );
  }
  return Response.json({ ok: true, task: rows[0] });
});
