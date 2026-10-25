import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { chatJson } from "@/lib/ai";
import { isAiConfigured } from "@/lib/env";
import { resolveProviderForOrg } from "@/server/ai/settings";

export const dynamic = "force-dynamic";

/**
 * Proveedores: páginas web, repos, resúmenes y links (Instagram…) que el
 * usuario guarda como fuentes de información, organizados con etiquetas
 * y estrellas (rating 0–5).
 */

const TIPOS = ["pagina", "repo", "resumen", "instagram", "otro"] as const;
type TipoProveedor = (typeof TIPOS)[number];

/** Deduce el tipo desde la URL (GitHub → repo, Instagram → instagram…). */
function detectarTipo(url: string): TipoProveedor {
  const u = url.toLowerCase();
  if (/^https?:\/\/(www\.)?github\.com\//.test(u)) return "repo";
  if (/^https?:\/\/(www\.)?instagram\.com\//.test(u)) return "instagram";
  return "pagina";
}

/** Título de cortesía desde la URL mientras el usuario no lo edita. */
function tituloDesdeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 200);
  }
}

/** ⭐ y última actividad del repo público (best-effort, sin token). */
async function githubInfo(url: string): Promise<{ stars: number; pushed: string } | null> {
  const m = url.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (!m) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "DuqueLabs-CRM" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { stargazers_count?: number; pushed_at?: string };
    return { stars: j.stargazers_count ?? 0, pushed: j.pushed_at ?? "" };
  } catch {
    return null;
  }
}

/** Rellena título/notas/etiquetas que falten usando la IA del usuario. */
async function enriquecerConIA(
  organizationId: string,
  texto: string
): Promise<{ title?: string; notes?: string; tags?: string[] } | null> {
  const provider = await resolveProviderForOrg(organizationId).catch(() => null);
  if (!provider && !isAiConfigured()) return null;
  const res = await chatJson(
    z.object({
      title: z.string().trim().max(200).optional(),
      notes: z.string().trim().max(1000).optional(),
      tags: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
    }),
    [
      {
        role: "system",
        content:
          'Describes recursos web para un proveedor de información. A partir de una URL (y opcionalmente un título), devuelve SOLO JSON: {"title": nombre claro del sitio/repo/perfil, "notes": 1 frase de para qué sirve o qué aporta (inferelo del dominio si hace falta), "tags": 2-4 etiquetas cortas en minúsculas DEL TEMA (ej: "ia", "frontend", "ventas", "diseño")}. Nada más.',
      },
      { role: "user", content: texto },
    ],
    { provider: provider ?? undefined, timeoutMs: 20_000 }
  ).catch(() => null);
  return res?.ok ? (res.data as { title?: string; notes?: string; tags?: string[] }) : null;
}

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const tipo = url.searchParams.get("type");
  const q = url.searchParams.get("q")?.trim();
  const incluirArchivados = url.searchParams.get("includeArchived") === "true";

  const condiciones = [eq(schema.crmSupplier.organizationId, session.organizationId)];
  if ((TIPOS as readonly string[]).includes(tipo ?? "")) {
    condiciones.push(eq(schema.crmSupplier.type, tipo as TipoProveedor));
  }
  if (!incluirArchivados) condiciones.push(eq(schema.crmSupplier.archived, false));
  if (q) {
    // Busca en título, notas y etiquetas (jsonb serializado)
    const like = `%${q.toLowerCase()}%`;
    condiciones.push(
      or(
        ilike(schema.crmSupplier.title, like),
        ilike(schema.crmSupplier.notes, like),
        sql`LOWER(${schema.crmSupplier.tags}::text) LIKE ${like}`
      )!
    );
  }

  const db = getDb();
  const items = await db
    .select()
    .from(schema.crmSupplier)
    .where(and(...condiciones))
    .orderBy(desc(schema.crmSupplier.updatedAt))
    .limit(300);
  return Response.json({ items });
});

const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(20);

const postSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/\S+/i.test(v), "La URL debe ser http(s) válida o vacía")
    .default(""),
  title: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).default(""),
  type: z.enum(TIPOS).optional(),
  tags: tagsSchema.default([]),
  rating: z.number().int().min(0).max(5).default(0),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const d = body.data;
  if (!d.title && !d.url) {
    return Response.json(
      { error: { code: "invalid_body", message: "Hace falta un título o una URL" } },
      { status: 422 }
    );
  }
  const db = getDb();

  // Enriquecimiento automático: la IA rellena lo que falte (título, para
  // qué sirve, etiquetas del tema) y GitHub aporta ⭐ y actividad.
  let title = d.title || "";
  let notes = d.notes;
  let tags = d.tags;
  const ia = await enriquecerConIA(session.organizationId, [d.url, d.title].filter(Boolean).join(" ")).catch(() => null);
  if (ia) {
    if (!title && ia.title) title = ia.title;
    if (!notes && ia.notes) notes = ia.notes;
    if (tags.length === 0 && ia.tags?.length) tags = ia.tags;
  }
  const tipo = d.type ?? (d.url ? detectarTipo(d.url) : "resumen");
  const gh = d.url ? await githubInfo(d.url).catch(() => null) : null;

  const item = {
    id: newId("crmSupplier"),
    organizationId: session.organizationId,
    title: title || tituloDesdeUrl(d.url),
    url: d.url,
    type: tipo,
    notes,
    tags,
    rating: d.rating,
    ...(gh ? { githubStars: gh.stars, githubPushed: gh.pushed } : {}),
    archived: false,
  };
  const [creado] = await db.insert(schema.crmSupplier).values(item).returning();
  return Response.json({ ok: true, item: creado }, { status: 201 });
});

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/\S+/i.test(v), "La URL debe ser http(s) válida o vacía")
    .optional(),
  notes: z.string().trim().max(2000).optional(),
  type: z.enum(TIPOS).optional(),
  tags: tagsSchema.optional(),
  rating: z.number().int().min(0).max(5).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const { id, ...campos } = body.data;
  const cambios: Record<string, unknown> = { updatedAt: new Date() };
  for (const clave of ["title", "url", "notes", "type", "tags", "rating", "archived"] as const) {
    if (campos[clave] !== undefined) cambios[clave] = campos[clave];
  }
  // URL nueva → refrescar las ⭐ de GitHub del repo
  if (typeof campos.url === "string" && campos.url) {
    const gh = await githubInfo(campos.url).catch(() => null);
    if (gh) {
      cambios.githubStars = gh.stars;
      cambios.githubPushed = gh.pushed;
    }
  }

  const db = getDb();
  const [actualizado] = await db
    .update(schema.crmSupplier)
    .set(cambios)
    .where(
      and(
        eq(schema.crmSupplier.id, id),
        eq(schema.crmSupplier.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!actualizado) {
    return Response.json(
      { error: { code: "not_found", message: "Proveedor no encontrado" } },
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
    .delete(schema.crmSupplier)
    .where(
      and(
        eq(schema.crmSupplier.id, id),
        eq(schema.crmSupplier.organizationId, session.organizationId)
      )
    )
    .returning();
  if (!borrados[0]) {
    return Response.json(
      { error: { code: "not_found", message: "Proveedor no encontrado" } },
      { status: 404 }
    );
  }
  return Response.json({ ok: true });
});
