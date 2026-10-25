"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Instagram,
  Link2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";

/**
 * Proveedores: tus fuentes de información guardadas (páginas web, repos de
 * GitHub, resúmenes, links de Instagram…) con etiquetas y estrellas (rating
 * 0–5). Respaldado en la BD vía /api/suppliers.
 */

type Proveedor = {
  id: string;
  type: string;
  title: string;
  url: string;
  notes: string;
  tags: string[];
  rating: number;
  archived: boolean;
};

type Filtro = "todos" | "pagina" | "repo" | "resumen" | "instagram";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pagina", label: "Páginas" },
  { id: "repo", label: "Repos" },
  { id: "resumen", label: "Resúmenes" },
  { id: "instagram", label: "Instagram" },
];

const TIPOS: { id: string; label: string }[] = [
  { id: "pagina", label: "Página" },
  { id: "repo", label: "Repo" },
  { id: "resumen", label: "Resumen" },
  { id: "instagram", label: "Instagram" },
  { id: "otro", label: "Otro" },
];

function iconoTipo(type: string) {
  switch (type) {
    case "repo": return Github;
    case "resumen": return FileText;
    case "instagram": return Instagram;
    case "otro": return Link2;
    default: return Globe;
  }
}

/** Deduce el tipo desde la URL (misma regla que la API). */
function detectarTipo(url: string): string {
  const u = url.toLowerCase();
  if (/^https?:\/\/(www\.)?github\.com\//.test(u)) return "repo";
  if (/^https?:\/\/(www\.)?instagram\.com\//.test(u)) return "instagram";
  return "pagina";
}

/** Título de cortesía desde la URL mientras el usuario no lo edita. */
function tituloDesdeUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function SuppliersPage() {
  const [items, setItems] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<null | Partial<Proveedor>>(null);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    recargar();
  }, []);

  function recargar() {
    fetch("/api/suppliers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }

  function flash(texto: string) {
    setMensaje(texto);
    setTimeout(() => setMensaje(""), 4000);
  }

  const visibles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filtro !== "todos" && it.type !== filtro) return false;
      if (!qq) return true;
      return (
        it.title.toLowerCase().includes(qq) ||
        it.notes.toLowerCase().includes(qq) ||
        it.tags.some((t) => t.toLowerCase().includes(qq))
      );
    });
  }, [items, filtro, q]);

  async function guardar() {
    if (!editando?.title?.trim()) return;
    const esNuevo = !editando.id;
    const payload = {
      title: editando.title,
      url: editando.url ?? "",
      notes: editando.notes ?? "",
      type: editando.type ?? (editando.url ? detectarTipo(editando.url) : "pagina"),
      tags: editando.tags ?? [],
      rating: editando.rating ?? 0,
    };
    const res = await fetch("/api/suppliers", {
      method: esNuevo ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(esNuevo ? payload : { ...payload, id: editando.id }),
    }).catch(() => null);
    if (res?.ok) {
      flash(esNuevo ? "Proveedor guardado ✅" : "Actualizado ✅");
      setEditando(null);
      recargar();
    } else {
      flash("No se pudo guardar");
    }
  }

  /** Califica con estrellas al instante (PATCH optimista). */
  async function calificar(it: Proveedor, rating: number) {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, rating } : x)));
    const res = await fetch("/api/suppliers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, rating }),
    }).catch(() => null);
    if (!res?.ok) recargar();
  }

  async function alternarArchivado(it: Proveedor) {
    await fetch("/api/suppliers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, archived: !it.archived }),
    }).catch(() => null);
    recargar();
  }

  async function eliminar(it: Proveedor) {
    if (!window.confirm(`¿Eliminar «${it.title}» de tus proveedores?`)) return;
    const res = await fetch(`/api/suppliers?id=${encodeURIComponent(it.id)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (res?.ok) setItems((prev) => prev.filter((x) => x.id !== it.id));
  }

  const estrellas = (n: number, onClick?: (r: number) => void) => (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} estrellas`}
          onClick={onClick ? () => onClick(i === n ? 0 : i) : undefined}
          className={onClick ? "transition-transform active:scale-90" : "cursor-default"}
        >
          <Star
            className={`h-3.5 w-3.5 ${i <= n ? "fill-[#ff9f0a] text-[#ff9f0a]" : "text-gray-300"}`}
          />
        </button>
      ))}
    </span>
  );

  return (
    <div className="h-full overflow-y-auto p-4 pb-28 md:p-6 md:pb-6">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold md:text-xl">Proveedores</h2>
            <p className="text-xs text-muted-foreground md:text-sm">
              Páginas, repos, resúmenes e Instagram — tus fuentes organizadas
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditando({ type: "pagina", tags: [], rating: 0 })}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white shadow-sm transition-transform active:scale-[0.97] md:text-sm"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Agregar
          </button>
        </div>

        {mensaje && (
          <div className="rounded-xl border border-brand/30 bg-brand-tint/40 px-3 py-2 text-xs font-medium md:text-sm">
            {mensaje}
          </div>
        )}

        {/* Formulario agregar/editar */}
        {editando && (
          <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editando.id ? "Editar" : "Nuevo proveedor"}</h3>
              <button type="button" onClick={() => setEditando(null)} aria-label="Cerrar">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <input
              value={editando.url ?? ""}
              onChange={(e) =>
                setEditando((p) =>
                  p
                    ? {
                        ...p,
                        url: e.target.value,
                        // En nuevos deduce el tipo y autollena el título si está vacío
                        type: p.id ? (p.type ?? "pagina") : detectarTipo(e.target.value),
                        title: p.title?.trim() ? p.title : tituloDesdeUrl(e.target.value),
                      }
                    : p
                )
              }
              inputMode="url"
              placeholder="https://github.com/usuario/repo · instagram.com/cuenta · página web"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <input
              value={editando.title ?? ""}
              onChange={(e) => setEditando((p) => ({ ...p, title: e.target.value }))}
              placeholder="¿Qué es? (título)"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <textarea
              value={editando.notes ?? ""}
              onChange={(e) => setEditando((p) => ({ ...p, notes: e.target.value }))}
              placeholder="¿Para qué te sirve? (opcional)"
              rows={2}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <input
              value={(editando.tags ?? []).join(", ")}
              onChange={(e) =>
                setEditando((p) => ({
                  ...p,
                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
                }))
              }
              placeholder="Etiquetas separadas por coma"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEditando((p) => ({ ...p, type: t.id }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      (editando.type ?? "pagina") === t.id
                        ? "bg-brand text-white"
                        : "border bg-white text-muted-foreground dark:bg-gray-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {estrellas(editando.rating ?? 0, (r) => setEditando((p) => (p ? { ...p, rating: r } : p)))}
            </div>
            <button
              type="button"
              onClick={guardar}
              className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white"
            >
              Guardar proveedor
            </button>
          </div>
        )}

        {/* Filtros + búsqueda */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filtro === f.id
                    ? "bg-brand text-white"
                    : "border bg-white text-muted-foreground dark:bg-gray-900"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 md:ml-auto md:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, nota o etiqueta…"
              className="w-full rounded-xl border bg-white py-2 pl-8 pr-3 text-sm focus:border-brand focus:outline-none dark:bg-gray-900"
            />
          </div>
        </div>

        {/* Lista */}
        {cargando ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : visibles.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="font-medium">
              {q || filtro !== "todos" ? "Nada que coincida con el filtro" : "Aún no tienes proveedores"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {q || filtro !== "todos"
                ? "Prueba con otra búsqueda o filtro"
                : "Guarda tu primera página, repo o link de Instagram — pega la URL y listo"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {visibles.map((it) => {
              const Icono = iconoTipo(it.type);
              return (
                <div
                  key={it.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-gray-900 ${
                    it.archived ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                      <Icono className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm font-semibold">{it.title}</b>
                      {it.url && (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 truncate text-xs text-brand hover:underline"
                        >
                          <span className="truncate">{it.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      )}
                      {it.notes && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.notes}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {it.rating > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5">
                            {estrellas(it.rating, (r) => calificar(it, r))}
                          </span>
                        )}
                        {it.rating === 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            Calificar: {estrellas(it.rating, (r) => calificar(it, r))}
                          </span>
                        )}
                        {it.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 border-t pt-2.5">
                    <button
                      type="button"
                      onClick={() => setEditando(it)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarArchivado(it)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      {it.archived ? (
                        <><ArchiveRestore className="h-3.5 w-3.5" /> Restaurar</>
                      ) : (
                        <><Archive className="h-3.5 w-3.5" /> Archivar</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminar(it)}
                      className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
