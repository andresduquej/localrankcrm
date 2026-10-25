import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Enriquecimiento ligero al agregar un contacto: a partir del teléfono y/o
 * usuario de Instagram arma los enlaces directos (WhatsApp, Instagram,
 * búsqueda en LinkedIn/Google) e intenta traer la foto de perfil pública de
 * Instagram (og:image). Sin APIs pagas; todo lo que falle se omite.
 */

const bodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  instagram: z.string().trim().max(60).optional(),
});

/** Solo dígitos con código de país para wa.me. */
function whatsappDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Foto de perfil pública de Instagram (og:image). Puede fallar → null. */
async function instagramAvatar(user: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(user)}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const og = html.match(/property="og:image"\s+content="([^"]+)"/) ?? html.match(/content="([^"]+)"\s+property="og:image"/);
    const url = og?.[1];
    return url && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

export const POST = withAuth(async (session, req: Request) => {
  void session;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { name, phone, instagram } = body.data;

  const digits = phone ? whatsappDigits(phone) : "";
  const igUser = (instagram ?? "").replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "").trim();

  const enlaces: Record<string, string> = {};
  if (digits.length >= 8) enlaces.whatsapp = `https://wa.me/${digits}`;
  if (igUser) enlaces.instagram = `https://instagram.com/${igUser}`;
  if (name) {
    enlaces.linkedin = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(name)}`;
    enlaces.google = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${igUser ? `@${igUser}` : ""}`.trim())}`;
  }

  const avatarUrl = igUser ? await instagramAvatar(igUser) : null;

  return Response.json({
    ok: true,
    enlaces,
    avatarUrl,
    instagramUser: igUser || null,
    note: avatarUrl
      ? "Foto de perfil de Instagram encontrada ✅"
      : igUser
        ? "No pude traer la foto de Instagram (perfil privado o bloqueado) — usa las iniciales"
        : "Agrega su usuario de Instagram para intentar traer su foto",
  });
});
