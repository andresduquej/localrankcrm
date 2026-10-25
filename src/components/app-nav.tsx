"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Book,
  ChevronDown,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { getActiveWorkspaceId, loadFromStorage } from "@/lib/local-storage";
import { useEvents } from "@/components/use-events";
import { NAV_CATEGORIES, PERSONAL_MODE_EVENT, PERSONAL_NAV, isPersonalMode } from "@/lib/nav";

export function AppNav({
  branding,
  userName,
  role,
}: {
  branding: Branding;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [activeWsName, setActiveWsName] = useState("");
  const [personal, setPersonal] = useState(true);
  const isPreview = pathname.startsWith("/preview");
  const prefix = isPreview ? "/preview" : "";

  // Modo personal (por defecto): 6 destinos tuyos; el resto a un botón.
  useEffect(() => {
    setPersonal(isPersonalMode());
    const onMode = () => setPersonal(isPersonalMode());
    window.addEventListener(PERSONAL_MODE_EVENT, onMode);
    return () => window.removeEventListener(PERSONAL_MODE_EVENT, onMode);
  }, []);

  function setModePersonal(v: boolean) {
    try {
      localStorage.setItem("duquelabs_personal_mode", String(v));
    } catch {}
    window.dispatchEvent(new Event(PERSONAL_MODE_EVENT));
  }

  // Load workspace name from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Get active workspace name
      const wsId = getActiveWorkspaceId();
      if (wsId && wsId !== "default") {
        const workspaces = loadFromStorage<Array<{id: string; name: string}>>("workspaces_v2", []);
        const ws = workspaces.find(w => w.id === wsId);
        if (ws) setActiveWsName(ws.name);
      }
    }
  }, []);

  async function refetchUnread() {
    if (isPreview) return;
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void refetchUnread();
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
  });

  return (
    // En móvil la navegación vive en MobileShell (tab bar iOS + hoja Más);
    // este aside es exclusivo de desktop.
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-[var(--sidebar-bg)] px-3 pb-3.5 pt-6 md:flex">
      {/* Brand white-label + theme toggle */}
      <div className="mb-6 flex items-center gap-2.5 px-3">
        <img src="/icon.svg" alt={branding.name} className="h-[32px] w-[32px] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-[700] leading-tight tracking-tight text-white">
            {branding.name}
          </span>
          <span className="block text-[11px] text-white/60">{activeWsName || "Enterprise CRM"}</span>
        </span>
        <button
          onClick={() => {
            const root = document.documentElement;
            const isDark = root.classList.contains("dark");
            if (isDark) { root.classList.remove("dark"); localStorage.setItem("localrank_appearance_config", JSON.stringify({ theme: "light", language: "es" })); }
            else { root.classList.add("dark"); localStorage.setItem("localrank_appearance_config", JSON.stringify({ theme: "dark", language: "es" })); }
          }}
          className="rounded-full p-1.5 text-white/40 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          title="Cambiar tema claro/oscuro"
        >
          <svg className="h-4 w-4 hidden dark:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          <svg className="h-4 w-4 block dark:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 overflow-y-auto">
        {/* Search trigger — inside sidebar, never overlaps content */}
        <button onClick={() => { const e = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }); window.dispatchEvent(e); }} className="flex items-center gap-[11px] rounded-lg px-3 py-2 text-sm font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors mb-1">
          <Search className="h-[18px] w-[18px]" strokeWidth={1.7} /><span className="flex-1">Buscar...</span><kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-white/40">⌘K</kbd>
        </button>
        {/* Dashboard / Hoy — siempre visible */}
        <Link href={`${prefix}/dashboard`} className={cn("flex items-center gap-[11px] rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", (pathname === `${prefix}/dashboard` || pathname === "/dashboard") ? "bg-[var(--sidebar-active)] border-l-[3px] border-[var(--sidebar-active-text)] text-[var(--sidebar-active-text)]" : "text-white/70 hover:text-white hover:bg-white/10")}>
          <LayoutDashboard className="h-[18px] w-[18px]" strokeWidth={1.7} /><span>{personal ? "Hoy" : "Dashboard"}</span>
        </Link>

        {personal ? (
          /* Modo personal: solo lo tuyo, del tamaño de tu día. */
          <div className="mt-1 space-y-0.5">
            {PERSONAL_NAV.filter(i => i.href !== "/dashboard").map(item => {
              const href = `${prefix}${item.href}`;
              const active = pathname === href || pathname.startsWith(`${href}/`) || pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={href} className={cn("flex items-center gap-[10px] rounded-lg px-3 py-2 text-[13px] font-medium transition-colors", active ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-white/70 hover:text-white hover:bg-white/10")}>
                  <item.icon className="h-[15px] w-[15px] text-white/50" strokeWidth={1.5} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
            <button onClick={() => setModePersonal(false)} className="mt-2 flex w-full items-center gap-[10px] rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/40 hover:text-white/70 hover:bg-white/5">
              <Menu className="h-[13px] w-[13px]" strokeWidth={1.7} />
              <span className="flex-1 text-left">Ver todos los módulos</span>
            </button>
          </div>
        ) : (
          /* Modo completo: todas las categorías. */
          <>
          {NAV_CATEGORIES.map(cat => {
          const isExpanded = expandedCats.has(cat.label);
          const hasActive = cat.items.some(item => pathname === `${prefix}${item.href}` || pathname === item.href || pathname.startsWith(`${prefix}${item.href}/`));
          return (
            <div key={cat.label}>
              <button onClick={() => { const next = new Set(expandedCats); if (next.has(cat.label)) next.delete(cat.label); else next.add(cat.label); setExpandedCats(next); }} className={cn("flex w-full items-center gap-[11px] rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors mt-1", hasActive ? "text-[var(--sidebar-active-text)]" : "text-white/40 hover:text-white/60")}>
                <ChevronDown className={cn("h-3 w-3 transition-transform", !isExpanded && "-rotate-90")} />
                <span className="flex-1 text-left">{cat.label}</span>
                <span className="text-[9px] font-normal opacity-60">{cat.items.length}</span>
              </button>
              {isExpanded && (
                <div className="space-y-0.5 ml-1">
                  {cat.items.map(item => {
                    const href = `${prefix}${item.href}`;
                    const active = pathname === href || pathname.startsWith(`${href}/`) || pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link key={item.href} href={href} className={cn("flex items-center gap-[10px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-white/60 hover:text-white hover:bg-white/8")}>
                        <item.icon className={cn("h-[14px] w-[14px]", active ? "text-[var(--sidebar-active-text)]" : "text-white/50")} strokeWidth={1.5} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge === true && unread > 0 && <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-white/20 px-1 text-[9px] font-semibold text-white">{unread}</span>}
                        {typeof item.badge === "string" && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-300">{item.badge}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
          <button onClick={() => setModePersonal(true)} className="mt-2 flex w-full items-center gap-[10px] rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/40 hover:text-white/70 hover:bg-white/5">
            <Menu className="h-[13px] w-[13px]" strokeWidth={1.7} />
            <span className="flex-1 text-left">Volver al modo personal</span>
          </button>
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* Help & Support */}
      <div className="mb-1 space-y-0.5 border-t border-white/10 pt-2">
        <Link href={`${prefix}/docs`} className={cn("flex items-center gap-[10px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", pathname === `${prefix}/docs` || pathname === "/docs" ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-white/50 hover:text-white/80 hover:bg-white/5")}>
          <Book className="h-[14px] w-[14px]" strokeWidth={1.5} /><span>Documentación</span>
        </Link>
        <Link href={`${prefix}/suggestions`} className={cn("flex items-center gap-[10px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", pathname === `${prefix}/suggestions` || pathname === "/suggestions" ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-white/50 hover:text-white/80 hover:bg-white/5")}>
          <Lightbulb className="h-[14px] w-[14px]" strokeWidth={1.5} /><span>Sugerencias</span>
        </Link>
        <Link href={`${prefix}/trash`} className={cn("flex items-center gap-[10px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", pathname.includes("/trash") ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]" : "text-white/50 hover:text-white/80 hover:bg-white/5")}>
          <Trash2 className="h-[14px] w-[14px]" strokeWidth={1.5} /><span>Papelera</span>
        </Link>
      </div>

      <Link
        href={`${prefix}/settings`}
        className={cn(
          "flex items-center gap-[11px] rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          pathname.startsWith("/settings") || pathname.startsWith("/preview/settings")
            ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]"
            : "text-white/70 hover:text-white hover:bg-white/10"
        )}
      >
        <Settings
          className={cn(
            "h-[18px] w-[18px]",
            pathname.startsWith("/settings") || pathname.startsWith("/preview/settings") ? "text-[var(--sidebar-active-text)]" : "text-white/70"
          )}
          strokeWidth={1.7}
        />
        Ajustes
      </Link>

      <div className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-white/10">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white">
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{userName}</span>
          <span className="block text-[11px] text-white/60">
            {role === "owner" ? "Propietario" : "Equipo"}
          </span>
        </span>
        <button
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded p-1 text-white/50 hover:text-white"
          onClick={async () => {
            if (!isPreview) await signOut();
            router.push(isPreview ? "/preview/dashboard" : "/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>

      {/* Save session checklist */}
      <div className="mx-3 mb-2 mt-1 rounded-lg bg-white/5 px-3 py-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={typeof window !== "undefined" && localStorage.getItem("localrank_save_session") === "true"}
            onChange={(e) => {
              if (typeof window !== "undefined") {
                localStorage.setItem("localrank_save_session", String(e.target.checked));
                if (e.target.checked) {
                  localStorage.setItem("localrank_session_saved_at", new Date().toISOString());
                }
              }
            }}
            className="accent-[var(--sidebar-active-text)] h-3.5 w-3.5 rounded"
          />
          <span className="text-[11px] text-white/70">Guardar sesión</span>
        </label>
        <p className="mt-0.5 pl-5.5 text-[9px] text-white/40">Mantiene tus datos entre visitas</p>
      </div>
    </aside>
  );
}
