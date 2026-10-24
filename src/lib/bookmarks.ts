/**
 * Utilidades puras de la Bóveda (sin DOM ni red): detección de tipo,
 * parsing de URLs de GitHub y del export de favoritos de Chrome (Netscape).
 * Todo testeable en node con vitest.
 */

export type VaultType = "repo" | "pagina" | "herramienta";

/** Dominios de herramientas conocidas → se guardan como "herramienta". */
const DOMINIOS_HERRAMIENTA = [
  "figma.com",
  "notion.so",
  "vercel.com",
  "chat.openai.com",
  "chatgpt.com",
  "drive.google.com",
  "colab.research.google.com",
  "huggingface.co",
  "npmjs.com",
];

/** Detecta el tipo de un ítem de la bóveda a partir de su URL. */
export function detectType(url: string): VaultType {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "pagina";
  }
  if (host === "github.com" || host.endsWith(".github.com")) return "repo";
  if (DOMINIOS_HERRAMIENTA.some((d) => host === d || host.endsWith(`.${d}`))) {
    return "herramienta";
  }
  return "pagina";
}

/** Primeros segmentos de github.com que son páginas del sitio, no repos. */
const GITHUB_NO_REPO = new Set([
  "topics",
  "search",
  "explore",
  "trending",
  "collections",
  "events",
  "features",
  "pricing",
  "security",
  "enterprise",
  "customers",
  "marketplace",
  "orgs",
  "settings",
  "notifications",
  "new",
  "about",
  "site",
  "sponsors",
  "apps",
  "integrations",
  "login",
  "join",
  "issues",
  "pulls",
]);

export type GithubRepoInfo = { owner: string; repo: string };

/**
 * Extrae {owner, repo} de URLs tipo github.com/owner/repo(/tree|/blob|...).
 * Devuelve null si falta owner/repo o si es una página del sitio (topics, search…).
 */
export function parseGithubRepo(url: string): GithubRepoInfo | null {
  let path = "";
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() !== "github.com" && !u.hostname.toLowerCase().endsWith(".github.com")) {
      return null;
    }
    path = u.pathname;
  } catch {
    return null;
  }
  const partes = path.split("/").filter(Boolean);
  if (partes.length < 2) return null; // sin owner o sin repo
  const [owner, repoRaw] = partes as [string, string];
  if (GITHUB_NO_REPO.has(owner.toLowerCase())) return null;
  // owner/repo faltantes o placeholder ("github.com/owner/")
  const repo = repoRaw.replace(/\.git$/, "").trim();
  if (!owner || !repo) return null;
  return { owner, repo };
}

export type BookmarkImportado = { title: string; url: string; folder: string };

/** Decodifica las entidades HTML básicas de los títulos del export. */
function decodificarHtml(texto: string): string {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .trim();
}

/** Máximo de favoritos que devuelve el parser (evita explosiones de memoria). */
export const MAX_BOOKMARKS = 500;

/**
 * Parsea un export de Chrome/Firefox (formato Netscape) SIN DOMParser:
 * un solo recorrido con regex sobre <DT><H3>Carpeta</H3> (pila de carpetas,
 * <DL> abre y </DL> cierra) y <DT><A HREF="...">Título</A>.
 * Filtra: solo http(s), dedupe por URL, máx MAX_BOOKMARKS.
 */
export function parseBookmarksHtml(html: string): BookmarkImportado[] {
  const resultado: BookmarkImportado[] = [];
  const vistas = new Set<string>();
  const pilaCarpetas: string[] = [];
  let carpetaPendiente: string | null = null; // <H3> que aún no va seguido de <DL>

  const patron =
    /<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DL[^>]*>|<\/DL>|<DT>\s*<A\s+[^>]*?HREF\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/A>|<DT>\s*<A\s+[^>]*?HREF\s*=\s*'([^']*)'[^>]*>([\s\S]*?)<\/A>/gi;

  let m: RegExpExecArray | null;
  while ((m = patron.exec(html)) !== null) {
    // <H3> → carpeta pendiente (se apila cuando llegue su <DL>)
    if (m[1] !== undefined) {
      carpetaPendiente = decodificarHtml(m[1]);
      continue;
    }
    // <DL> abre nivel: apila la carpeta pendiente (si la hay)
    if (m[2] === undefined && m[4] === undefined && m[0].toUpperCase().startsWith("<DL")) {
      pilaCarpetas.push(carpetaPendiente ?? "");
      carpetaPendiente = null;
      continue;
    }
    // </DL> cierra nivel
    if (m[0].toUpperCase().startsWith("</DL")) {
      pilaCarpetas.pop();
      carpetaPendiente = null;
      continue;
    }
    // <A HREF="..."> → favorito (grupo 2 con comillas dobles, 4 con simples)
    const url = (m[2] ?? m[4] ?? "").trim();
    if (!/^https?:\/\//i.test(url)) continue; // filtra javascript:, chrome://, vacíos…
    const clave = url.toLowerCase();
    if (vistas.has(clave)) continue; // dedupe por URL
    if (resultado.length >= MAX_BOOKMARKS) break;
    vistas.add(clave);
    const title = decodificarHtml(m[3] ?? m[5] ?? "") || url;
    const folder = pilaCarpetas.filter(Boolean).join("/");
    resultado.push({ title, url, folder });
  }
  return resultado;
}
