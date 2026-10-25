import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { encryptSecret } from "@/lib/crypto";
import { listEvents, syncAllSources, syncSource } from "@/server/calendar/sync";

export const dynamic = "force-dynamic";

/**
 * Calendarios externos conectados (Google vía iCal, Calendly, Cal.com) y sus
 * eventos sincronizados. GET también devuelve las citas reales del bot para
 * que la UI las muestre juntas.
 */

export const GET = withAuth(async (session) => {
  const db = getDb();
  const sources = await db
    .select()
    .from(schema.calendarSource)
    .where(eq(schema.calendarSource.organizationId, session.organizationId));

  const from = new Date(Date.now() - 30 * 86_400_000);
  const to = new Date(Date.now() + 120 * 86_400_000);
  const events = await listEvents(session.organizationId, from, to);

  return Response.json({
    sources: sources.map((s) => ({
      id: s.id,
      type: s.type,
      name: s.name,
      enabled: s.enabled,
      lastSyncAt: s.lastSyncAt,
      lastError: s.lastError,
    })),
    events,
  });
});

const postSchema = z.object({
  type: z.enum(["ics", "calendly", "calcom"]),
  name: z.string().trim().min(1).max(60),
  url: z.string().trim().max(1000).optional(),
  token: z.string().trim().min(10).max(300).optional(),
});

/** Conecta una fuente y sincroniza de una vez. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const { type, name } = body.data;
  const url = type === "ics" ? (body.data.url ?? "") : "";
  const token = type === "ics" ? "" : (body.data.token ?? "");

  if (type === "ics" && !/^https?:\/\/.+/.test(url)) {
    return apiError(422, "invalid_url", "Pega la URL secreta en formato iCal de Google Calendar (empieza por https://calendar.google.com/calendar/ical/…)");
  }
  if (type !== "ics" && !token) {
    return apiError(422, "missing_token", `Pega el token de API de ${type === "calendly" ? "Calendly" : "Cal.com"}`);
  }

  const db = getDb();
  const enc = token ? encryptSecret(token) : null;
  const rows = await db
    .insert(schema.calendarSource)
    .values({
      id: newId("calendarSource"),
      organizationId: session.organizationId,
      type,
      name,
      url,
      ...(enc ? { tokenCipher: enc.cipher, tokenIv: enc.iv, tokenTag: enc.tag } : {}),
    })
    .returning();
  const source = rows[0]!;

  try {
    const count = await syncSource(source);
    return Response.json({ ok: true, source: { id: source.id, type, name }, synced: count }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        ok: true,
        source: { id: source.id, type, name },
        synced: 0,
        warning: `Conectado, pero la primera sincronización falló: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 201 }
    );
  }
});

/** Sincroniza todas las fuentes habilitadas. */
export const PUT = withAuth(async (session) => {
  const res = await syncAllSources(session.organizationId);
  return Response.json({ ok: true, ...res });
});

export const DELETE = withAuth(async (session, req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return apiError(422, "invalid_params", "Falta ?id=");
  const db = getDb();
  await db
    .delete(schema.calendarSource)
    .where(
      and(eq(schema.calendarSource.id, id), eq(schema.calendarSource.organizationId, session.organizationId))
    );
  return Response.json({ ok: true });
});
