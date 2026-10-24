import { describe, expect, it } from "vitest";
import {
  detectType,
  MAX_BOOKMARKS,
  parseBookmarksHtml,
  parseGithubRepo,
} from "@/lib/bookmarks";

/** Parser puro de la Bóveda: tipo de recurso, repos de GitHub y favoritos. */

describe("detectType", () => {
  it("GitHub → repo", () => {
    expect(detectType("https://github.com/andresduquej/localrankcrm")).toBe("repo");
  });

  it("herramientas conocidas → herramienta", () => {
    expect(detectType("https://www.figma.com/file/abc")).toBe("herramienta");
    expect(detectType("https://vercel.com/dashboard")).toBe("herramienta");
    expect(detectType("https://chat.openai.com/c/xyz")).toBe("herramienta");
  });

  it("resto → pagina", () => {
    expect(detectType("https://blog.midominio.co/articulo")).toBe("pagina");
    expect(detectType("")).toBe("pagina");
  });
});

describe("parseGithubRepo", () => {
  it("URL limpia", () => {
    expect(parseGithubRepo("https://github.com/owner/repo")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("con sub-rutas (tree/blob/issues)", () => {
    expect(parseGithubRepo("https://github.com/owner/repo/tree/main/src")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("inválidas → null", () => {
    expect(parseGithubRepo("https://github.com/solo-owner")).toBeNull();
    expect(parseGithubRepo("https://github.com/topics/ia")).toBeNull();
    expect(parseGithubRepo("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseGithubRepo("")).toBeNull();
  });
});

describe("parseBookmarksHtml", () => {
  const FIXTURE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
  <DT><H3>Trabajo</H3>
  <DL><p>
    <DT><A HREF="https://ejemplo.com/cliente">Cliente importante</A>
    <DT><A HREF="https://github.com/owner/repo">Repo del trabajo</A>
  </DL><p>
  <DT><H3>Herramientas</H3>
  <DL><p>
    <DT><A HREF="https://www.figma.com/file/abc">Diseños</A>
    <DT><A HREF="https://ejemplo.com/cliente">Duplicado</A>
    <DT><A HREF="javascript:void(0)">Bookmarklet raro</A>
  </DL><p>
</DL><p>`;

  it("extrae título, URL y carpeta", () => {
    const items = parseBookmarksHtml(FIXTURE);
    expect(items).toContainEqual({
      title: "Cliente importante",
      url: "https://ejemplo.com/cliente",
      folder: "Trabajo",
    });
    expect(items).toContainEqual({
      title: "Diseños",
      url: "https://www.figma.com/file/abc",
      folder: "Herramientas",
    });
  });

  it("deduplica por URL", () => {
    const items = parseBookmarksHtml(FIXTURE);
    const urls = items.map((i) => i.url);
    expect(urls.filter((u) => u === "https://ejemplo.com/cliente")).toHaveLength(1);
  });

  it("filtra URLs no http(s)", () => {
    const items = parseBookmarksHtml(FIXTURE);
    expect(items.every((i) => i.url.startsWith("http"))).toBe(true);
  });

  it("respeta el tope MAX_BOOKMARKS", () => {
    const many = Array.from(
      { length: MAX_BOOKMARKS + 50 },
      (_, i) => `<DT><A HREF="https://x.com/${i}">L${i}</A>`
    ).join("\n");
    expect(parseBookmarksHtml(`<DL><p>${many}</DL><p>`)).toHaveLength(MAX_BOOKMARKS);
  });

  it("HTML vacío o basura → lista vacía sin lanzar", () => {
    expect(parseBookmarksHtml("")).toEqual([]);
    expect(parseBookmarksHtml("<html>no es bookmarks</html>")).toEqual([]);
  });
});
