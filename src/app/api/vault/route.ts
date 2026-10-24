import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { detectType } from "@/lib/bookmarks";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export const dynamic = "force-dynamic";

/** Bóveda de recursos: repos de GitHub, páginas y herramientas de la organización. */

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const tipo = url.searchParams.get("type");
  const q = url.searchParams.get("q")?.trim();
  const incluirArchivados = url.searchParams.get("includeArchived") === "true";

  const condiciones = [eq(schema.vaultItem.organizationId, session.organizationId)];
  if (tipo === "repo" || tipo === "pagina" || tipo === "herramienta") {
    condiciones.push(eq(schema.vaultItem.type, tipo));
  }
  if (!incluirArchivados) condiciones.push(eq(schema.vaultItem.archived, false));
  if (q) {
    // Busca en título, notas y etiquetas (jsonb serializado)
    const like = `%${q.toLowerCase()}%`;
    condiciones.push(
      or(
        ilike(schema.vaultItem.title, like),
        ilike(schema.vaultItem.notes, like),
        sql`LOWER(${schema.vaultItem.tags}::text) LIKE ${like}`
      )!
    );
  }

  const db = getDb();
  const items = await db
    .select()
    .from(schema.vaultItem)
    .where(and(...condiciones))
    .orderBy(desc(schema.vaultItem.updatedAt))
    .limit(200);
  return Response.json({ items });
});

const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(20);

const postSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/\S+/i.test(v), "La URL debe ser http(s) válida o vacía")
    .default(""),
  notes: z.string().trim().max(2000).default(""),
  type: z.enum(["repo", "pagina", "herramienta"]).optional(),
  tags: tagsSchema.default([]),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  // Si no viene el tipo, se deduce de la URL (GitHub → repo, herramientas conocidas…)
  const item = {
    id: newId("vaultItem"),
    organizationId: session.organizationId,
    type: body.data.type ?? detectType(body.data.url),
    title: body.data.title,
    url: body.data.url,
    notes: body.data.notes,
    tags: body.data.tags,
    archived: false,
  };
  const [creado] = await db.insert(schema.vaultItem).values(item).returning();
  return Response.json({ ok: true, item: creado }, { status: 201 });
});

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  tags: tagsSchema.optional(),
  archived: z.boolean().optional(),
  type: z.enum(["repo", "pagina", "herramienta"]).optional(),
});

export const PATCH = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const { id, ...campos } = body.data;
  const cambios: Record<string, unknown> = { updatedAt: new Date() };
  if (campos.title !== undefined) cambios.title = campos.title;
  if (campos.notes !== undefined) cambios.notes = campos.notes;
  if (campos.tags !== undefined) cambios.tags = campos.tags;
  if (campos.archived !== undefined) cambios.archived = campos.archived;
  if (campos.type !== undefined) cambios.type = campos.type;

  const db = getDb();
  const [actualizado] = await db
    .update(schema.vaultItem)
    .set(cambios)
    .where(
      and(
        eq(schema.vaultItem.id, id),
        eq(schema.vaultItem.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!actualizado) {
    return Response.json(
      { error: { code: "not_found", message: "Ítem no encontrado" } },
      { status: 404 }
    );
  }
  return Response.json({ ok: true, item: actualizado });
});

export const DELETE = withAuth(async (session, req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json(
      { error: { code: "missing_id", message: "Falta el parámetro id" } },
      { status: 422 }
    );
  }
  const db = getDb();
  const borrados = await db
    .delete(schema.vaultItem)
    .where(
      and(
        eq(schema.vaultItem.id, id),
        eq(schema.vaultItem.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!borrados[0]) {
    return Response.json(
      { error: { code: "not_found", message: "Ítem no encontrado" } },
      { status: 404 }
    );
  }
  return Response.json({ ok: true });
});
