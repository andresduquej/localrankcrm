import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { parseGithubRepo } from "@/lib/bookmarks";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Chequeo de actualizaciones de GitHub para los repos de la bóveda.
 * Sin token: la API pública de GitHub permite 60 req/h, suficiente.
 */

/** Máximo de repos por llamada (respeta el rate limit anónimo). */
const MAX_CHEQUEO = 25;

const UA = "DuqueLabs-CRM";

const postSchema = z.object({
  ids: z.array(z.string().min(1)).max(200).optional(),
});

type GithubMeta = {
  stars: number;
  pushedAt: string | null;
  defaultBranch: string | null;
  latestRelease: { tag: string; publishedAt: string } | null;
  lastChecked: string;
};

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  // Con ids: solo esos (de la org). Sin ids: todos los repos de la org.
  const items = body.data.ids?.length
    ? await db
        .select()
        .from(schema.vaultItem)
        .where(
          and(
            eq(schema.vaultItem.organizationId, session.organizationId),
            inArray(schema.vaultItem.id, body.data.ids)
          )
        )
        .limit(MAX_CHEQUEO)
    : await db
        .select()
        .from(schema.vaultItem)
        .where(
          and(
            eq(schema.vaultItem.organizationId, session.organizationId),
            eq(schema.vaultItem.type, "repo"),
            isNotNull(schema.vaultItem.url),
            ne(schema.vaultItem.url, "")
          )
        )
        .limit(MAX_CHEQUEO);

  const actualizados: {
    id: string;
    title: string;
    pushedAt: string | null;
    latestRelease: { tag: string; publishedAt: string } | null;
  }[] = [];
  let revisados = 0;

  for (const item of items) {
    const repo = parseGithubRepo(item.url);
    if (!repo) continue; // no es una URL de repo: se ignora

    const anterior = (item.githubMeta ?? null) as Partial<GithubMeta> | null;
    const ahora = new Date().toISOString();
    revisados++;

    let meta: GithubMeta = {
      stars: anterior?.stars ?? 0,
      pushedAt: anterior?.pushedAt ?? null,
      defaultBranch: anterior?.defaultBranch ?? null,
      latestRelease: anterior?.latestRelease ?? null,
      lastChecked: ahora,
    };

    try {
      const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": UA },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          stargazers_count?: number;
          pushed_at?: string | null;
          default_branch?: string | null;
        };
        meta = {
          stars: data.stargazers_count ?? 0,
          pushedAt: data.pushed_at ?? null,
          defaultBranch: data.default_branch ?? null,
          latestRelease: null,
          lastChecked: ahora,
        };
        // Última release (silencioso si falla o no hay)
        try {
          const rel = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`,
            { headers: { Accept: "application/vnd.github+json", "User-Agent": UA }, cache: "no-store" }
          );
          if (rel.ok) {
            const rdata = (await rel.json()) as { tag_name?: string; published_at?: string | null };
            if (rdata.tag_name) {
              meta.latestRelease = { tag: rdata.tag_name, publishedAt: rdata.published_at ?? ahora };
            }
          }
        } catch {
          // sin release: se deja como estaba
        }
      }
      // 404/403 (rate limit) u otro error: solo se marca la fecha del chequeo y se sigue
    } catch {
      // error de red: idem, la fecha del chequeo queda registrada
    }

    await db
      .update(schema.vaultItem)
      .set({ githubMeta: meta })
      .where(
        and(
          eq(schema.vaultItem.id, item.id),
          eq(schema.vaultItem.organizationId, session.organizationId)
        )
      );

    actualizados.push({
      id: item.id,
      title: item.title,
      pushedAt: meta.pushedAt,
      latestRelease: meta.latestRelease,
    });
  }

  return Response.json({ checked: revisados, updated: actualizados });
});
