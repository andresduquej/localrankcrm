import {
  Building2,
  Calendar,
  CheckSquare,
  Database,
  LayoutDashboard,
  MessageSquare,
  StickyNote,
  Users,
} from "lucide-react";

/**
 * Navegación del CRM — UNA sola cara: lo tuyo.
 * (Los ~47 módulos enterprise del código original fueron eliminados; esto
 * es lo que queda y lo que la app entera debe mantener.)
 */

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: boolean | string;
};
export type NavCategory = { label: string; items: NavItem[] };

/** Todos los destinos del CRM. */
export const CORE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Hoy", icon: LayoutDashboard },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  { href: "/vault", label: "Recursos", icon: Database },
  { href: "/notes", label: "Bóveda de ideas", icon: StickyNote },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/suppliers", label: "Proveedores", icon: Building2 },
  { href: "/inbox", label: "Chats", icon: MessageSquare, badge: true },
];

/** Compat: una sola categoría con todo. */
export const NAV_CATEGORIES: NavCategory[] = [{ label: "Lo tuyo", items: CORE_NAV }];

/** Lista plana (compat con consumidores existentes). */
export const ALL_NAV = CORE_NAV;

/** Tab bar móvil: 4 fijos + "Más" (la hoja con todo). */
export const MOBILE_TABS: NavItem[] = [
  { href: "/dashboard", label: "Hoy", icon: LayoutDashboard },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  { href: "/contacts", label: "Contactos", icon: Users },
];
