"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Book,
  ChevronRight,
  Lightbulb,
  MoreHorizontal,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import {
  ALL_NAV,
  MOBILE_TABS,
  NAV_CATEGORIES,
  PERSONAL_MOBILE_TABS,
  PERSONAL_MODE_EVENT,
  isPersonalMode,
  personalSheetCategories,
} from "@/lib/nav";
import { useEvents } from "@/components/use-events";

/**
 * Navegación móvil estilo iOS: cabecera flotante de vidrio con el título de
 * la sección, tab bar inferior con blur y la hoja "Más" (una sheet que sube
 * con curva de resorte) que contiene TODOS los módulos del CRM agrupados y
 * buscables. No elimina secciones: las que no caben en la tab bar viven en
 * la hoja. En modo personal (por defecto) la tab bar es lo tuyo: Hoy,
 * Agenda, Tareas, Contactos.
 */
export function MobileShell({ userName, role }: { userName: string; role: string }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const prefix = isPreview ? "/preview" : "";
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);
  const [personal, setPersonal] = useState(true);

  useEffect(() => {
    setPersonal(isPersonalMode());
    const onMode = () => setPersonal(isPersonalMode());
    window.addEventListener(PERSONAL_MODE_EVENT, onMode);
    return () => window.removeEventListener(PERSONAL_MODE_EVENT, onMode);
  }, []);

  /** Cambia entre modo personal (lo tuyo) y completo (todos los módulos). */
  function setModePersonal(v: boolean) {
    try {
      localStorage.setItem("duquelabs_personal_mode", String(v));
    } catch {}
    window.dispatchEvent(new Event("duquelabs-mode"));
  }

  const tabs = personal ? PERSONAL_MOBILE_TABS : MOBILE_TABS;

  // Título de la sección actual para la cabecera (large title compacto)
  const title = useMemo(() => {
    if (pathname.startsWith(`${prefix}/settings`) || pathname.startsWith("/settings")) return "Ajustes";
    const hit = ALL_NAV.find(
      (i) =>
        pathname === `${prefix}${i.href}` ||
        pathname === i.href ||
        pathname.startsWith(`${prefix}${i.href}/`) ||
        pathname.startsWith(`${i.href}/`)
    );
    return hit?.label ?? "CRM";
  }, [pathname, prefix]);

  async function refetchUnread() {
    if (isPreview) return;
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { conversations: { unreadCount: number }[] };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void refetchUnread();
    // Apariencia personal (acento + esquinas) guardada en este navegador
    import("@/lib/appearance").then(({ loadAppearance, applyAppearance }) => {
      applyAppearance(loadAppearance());
    });
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
  });

  // Cerrar la hoja al navegar y bloquear el scroll del fondo mientras abierta
  useEffect(() => {
    setMoreOpen(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = moreOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  const q = query.trim().toLowerCase();
  const categories = useMemo(() => {
    const base = personal ? personalSheetCategories() : NAV_CATEGORIES;
    if (!q) return base;
    return base
      .map((c) => ({
        label: c.label,
        items: c.items.filter((i) => i.label.toLowerCase().includes(q)),
      }))
      .filter((c) => c.items.length > 0);
  }, [q, personal]);

  const isActive = (href: string) =>
    pathname === `${prefix}${href}` ||
    pathname === href ||
    pathname.startsWith(`${prefix}${href}/`) ||
    (href === "/dashboard" && (pathname === "/" || pathname === "/preview"));

  return (
    <>
      {/* ── Cabecera flotante de vidrio (solo móvil) ─────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 glass-nav hairline-b md:hidden">
        <div className="pt-safe" />
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground ios-fade-enter" key={title}>
            {title}
          </span>
          <button
            onClick={() => {
              const e = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
              window.dispatchEvent(e);
            }}
            aria-label="Buscar"
            className="ios-press flex h-8 w-8 items-center justify-center rounded-full text-foreground/70"
          >
            <Search className="h-[19px] w-[19px]" strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/* ── Tab bar inferior de vidrio (solo móvil) ──────────────────── */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 glass-nav hairline-t md:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={`${prefix}${tab.href}`}
                className="ios-press relative flex min-w-[16%] flex-col items-center gap-0.5 rounded-xl px-2 py-1"
              >
                <span className="relative">
                  <tab.icon
                    className={cn("h-[24px] w-[24px] transition-colors", active ? "text-[var(--accent)]" : "text-foreground/55")}
                    strokeWidth={active ? 2.1 : 1.7}
                  />
                  {tab.badge === true && unread > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[10px] font-semibold text-white shadow-sm">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    active ? "text-[var(--accent)]" : "text-foreground/55"
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="Más secciones"
            className={cn(
              "ios-press flex min-w-[16%] flex-col items-center gap-0.5 rounded-xl px-2 py-1",
              moreOpen && "opacity-70"
            )}
          >
            <MoreHorizontal className="h-[24px] w-[24px] text-foreground/55" strokeWidth={1.7} />
            <span className="text-[10px] font-medium text-foreground/55">Más</span>
          </button>
        </div>
      </nav>

      {/* ── Hoja "Más": todas las secciones, agrupadas y buscables ──── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Todas las secciones">
          <div
            className="ios-fade-enter absolute inset-0 bg-black/35"
            onClick={() => setMoreOpen(false)}
          />
          <div className="ios-sheet-enter absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col overflow-hidden rounded-t-[28px] bg-background shadow-[0_-12px_48px_-12px_rgba(15,20,40,0.35)]">
            {/* tirador estilo iOS */}
            <div className="flex justify-center pt-2.5">
              <span className="h-[5px] w-10 rounded-full bg-foreground/20" />
            </div>

            {/* cabecera fija de la hoja: título, búsqueda y cierre */}
            <div className="glass-nav sticky top-0 z-10 px-4 pb-3 pt-2">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-[22px] font-bold tracking-[-0.02em] text-foreground">
                  Todas las secciones
                </h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  aria-label="Cerrar"
                  className="ios-press flex h-8 w-8 items-center justify-center rounded-full bg-foreground/8 text-foreground/70"
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
                </button>
              </div>
              <label className="mt-2.5 flex items-center gap-2 rounded-[12px] bg-foreground/6 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-foreground/40" strokeWidth={2} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar sección…"
                  className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-foreground/40"
                />
              </label>
            </div>

            {/* grupos inset estilo iOS Settings */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
              {categories.length === 0 && (
                <p className="py-10 text-center text-[15px] text-foreground/50">
                  No hay secciones que coincidan con «{query}».
                  {personal && (
                    <span className="mt-2 block text-xs">
                      Los demás módulos están escondidos — toca «Ver todos los módulos» para buscarlos.
                    </span>
                  )}
                </p>
              )}
              {categories.map((cat, catIdx) => (
                <section key={cat.label} className={cn(catIdx > 0 && "mt-5")}>
                  <h3 className="mb-1.5 px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground/45">
                    {cat.label}
                  </h3>
                  <div className="overflow-hidden rounded-[16px] bg-foreground/[0.035] hairline-t">
                    {cat.items.map((item, i) => (
                      <Link
                        key={item.href}
                        href={`${prefix}${item.href}`}
                        className={cn(
                          "ios-press-sm flex items-center gap-3 px-3.5 py-[11px] active:bg-foreground/5",
                          i > 0 && "hairline-t"
                        )}
                      >
                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-tint)] text-[var(--accent)]">
                          <item.icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                        </span>
                        <span className="flex-1 text-[15px] text-foreground">{item.label}</span>
                        {typeof item.badge === "string" && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                            {item.badge}
                          </span>
                        )}
                        {isActive(item.href) ? (
                          <span className="text-[12px] font-semibold text-[var(--accent)]">Aquí</span>
                        ) : (
                          <ChevronRight className="h-4 w-4 text-foreground/25" strokeWidth={2.4} />
                        )}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}

              {/* Cambio de modo: personal ↔ completo */}
              <button
                onClick={() => setModePersonal(!personal)}
                className="ios-press-sm mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] bg-foreground/[0.035] px-4 py-3 text-[14px] font-semibold text-foreground/80 hairline-t active:bg-foreground/5"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
                {personal ? "Ver todos los módulos" : "Volver al modo personal (solo lo tuyo)"}
              </button>

              {/* Sistema: docs, sugerencias, papelera, ajustes y cuenta */}
              <section className="mt-5">
                <h3 className="mb-1.5 px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground/45">
                  Sistema
                </h3>
                <div className="overflow-hidden rounded-[16px] bg-foreground/[0.035] hairline-t">
                  {[
                    { href: "/docs", label: "Documentación", icon: Book },
                    { href: "/suggestions", label: "Sugerencias", icon: Lightbulb },
                    { href: "/trash", label: "Papelera", icon: Trash2 },
                  ].map((r, i) => (
                    <Link
                      key={r.href}
                      href={`${prefix}${r.href}`}
                      className={cn(
                        "ios-press-sm flex items-center gap-3 px-3.5 py-[11px] active:bg-foreground/5",
                        i > 0 && "hairline-t"
                      )}
                    >
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-foreground/8 text-foreground/70">
                        <r.icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                      </span>
                      <span className="flex-1 text-[15px] text-foreground">{r.label}</span>
                      <ChevronRight className="h-4 w-4 text-foreground/25" strokeWidth={2.4} />
                    </Link>
                  ))}
                  <Link
                    href={`${prefix}/settings`}
                    className="ios-press-sm hairline-t flex items-center gap-3 px-3.5 py-[11px] active:bg-foreground/5"
                  >
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-foreground/8 text-foreground/70">
                      <Settings className="h-[17px] w-[17px]" strokeWidth={1.8} />
                    </span>
                    <span className="flex-1 text-[15px] text-foreground">Ajustes</span>
                    <ChevronRight className="h-4 w-4 text-foreground/25" strokeWidth={2.4} />
                  </Link>
                </div>
              </section>

              {/* cuenta */}
              <div className="mt-5 overflow-hidden rounded-[16px] bg-foreground/[0.035] hairline-t">
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[13px] font-semibold text-white">
                    {initials(userName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-foreground">{userName}</span>
                    <span className="block text-[12px] text-foreground/50">
                      {role === "owner" ? "Propietario" : "Equipo"}
                    </span>
                  </span>
                  <button
                    aria-label="Cerrar sesión"
                    onClick={async () => {
                      if (!isPreview) await signOut();
                      window.location.href = isPreview ? "/preview/dashboard" : "/login";
                    }}
                    className="ios-press rounded-full px-3 py-1.5 text-[13px] font-semibold text-[#ff3b30]"
                  >
                    Salir
                  </button>
                </div>
              </div>
              <div className="h-[calc(var(--safe-bottom)+16px)]" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
