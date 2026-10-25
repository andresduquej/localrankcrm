import {
  Activity,
  LayoutDashboard,
  Star,
  BarChart3,
  Bell,
  Bookmark,
  Bot,
  Building2,
  Calendar,
  CheckSquare,
  CircleCheckBig,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileText,
  FlaskConical,
  FolderKanban,
  FolderOpen,
  GitBranch,
  Heart,
  History,
  Kanban,
  Link2,
  Linkedin,
  Mail,
  MessageSquare,
  Search,
  Send,
  StickyNote,
  Tag,
  Target,
  Thermometer,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";

/**
 * Navegación central del CRM: categorías con todos los módulos.
 * La consumen el sidebar (desktop) y la tab bar iOS (móvil) — ninguna
 * sección se elimina, solo cambia cómo se presenta.
 */
export type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; badge?: boolean | string };
export type NavCategory = { label: string; items: NavItem[] };

export const NAV_CATEGORIES: NavCategory[] = [
  { label: "Prospección", items: [
    { href: "/radar", label: "Radar", icon: Bookmark },
    { href: "/lead-finder", label: "Lead Finder B2B", icon: Users },
    { href: "/scout", label: "Scout Scraper", icon: Search, badge: "soon" },
    { href: "/linkedin", label: "LinkedIn", icon: Linkedin },
    { href: "/cold-contacts", label: "Prospección", icon: Thermometer },
    { href: "/email-finder", label: "Email Finder", icon: Mail },
    { href: "/enrichment", label: "Enriquecimiento", icon: Database },
    { href: "/social-outreach", label: "Social Outreach", icon: MessageSquare },
    { href: "/social", label: "Social Engagement", icon: Heart },
    { href: "/forms", label: "Formularios", icon: ClipboardList },
    { href: "/import", label: "Importar", icon: Database },
    { href: "/suppliers", label: "Proveedores", icon: Building2 },
  ]},
  { label: "CRM & Ventas", items: [
    { href: "/contacts", label: "Contactos", icon: Users },
    { href: "/companies", label: "Compañías", icon: Building2 },
    { href: "/opportunities", label: "Oportunidades", icon: Target },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
    { href: "/tasks", label: "Tareas", icon: CheckSquare },
    { href: "/calendar", label: "Calendario", icon: Calendar },
    { href: "/focus", label: "Focus", icon: Target },
    { href: "/proposals", label: "Propuestas", icon: FileText },
    { href: "/cartera", label: "Cartera", icon: CreditCard },
    { href: "/subscriptions", label: "Suscripciones", icon: CreditCard },
  ]},
  { label: "Conversaciones", items: [
    { href: "/inbox", label: "Conversaciones", icon: MessageSquare, badge: true },
    { href: "/omnichannel", label: "Omnicanal", icon: Activity },
    { href: "/meeting-reminders", label: "Meeting Reminders", icon: Bell },
    { href: "/templates", label: "Plantillas", icon: Send },
    { href: "/settings/quick-replies", label: "Resp. Rápidas", icon: Send },
    { href: "/scheduler", label: "Scheduler", icon: Clock },
  ]},
  { label: "Automatización & IA", items: [
    { href: "/ai-hub", label: "IA & Automatización", icon: Bot },
    { href: "/automations", label: "Automatizaciones", icon: Zap },
    { href: "/sequences", label: "Secuencias", icon: GitBranch },
    { href: "/flows", label: "Flows", icon: GitBranch },
    { href: "/lead-routing", label: "Lead Routing", icon: GitBranch },
    { href: "/scoring", label: "Scoring", icon: Star },
    { href: "/ai-builder", label: "Constructor IA", icon: Bot },
    { href: "/ai-quoter", label: "Cotizador IA", icon: FileText },
  ]},
  { label: "Operación", items: [
    { href: "/projects", label: "Proyectos", icon: FolderKanban },
    { href: "/checklists", label: "Checklists", icon: CircleCheckBig },
    { href: "/reminders", label: "Recordatorios", icon: Clock },
    { href: "/todo", label: "To-Do", icon: CircleCheckBig },
    { href: "/notes", label: "Notas", icon: StickyNote },
    { href: "/labels", label: "Etiquetas", icon: Tag },
  ]},
  { label: "Equipo & Espacios", items: [
    { href: "/team", label: "Equipo", icon: UsersRound },
    { href: "/team-chat", label: "Chat interno", icon: MessageSquare },
    { href: "/workspaces", label: "Workspace", icon: FolderOpen },
    { href: "/vault", label: "Bóveda", icon: Database },
  ]},
  { label: "Datos & Control", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/files", label: "Archivos & IA", icon: FileText },
    { href: "/ocr", label: "OCR", icon: FileText },
    { href: "/backup", label: "Backup", icon: Database },
    { href: "/audit", label: "Auditoría", icon: History },
    { href: "/url-shortener", label: "Acortador URL", icon: Link2 },
    { href: "/lab", label: "Laboratorio", icon: FlaskConical },
  ]},
];

/** Lista plana de todos los módulos. */
export const ALL_NAV = NAV_CATEGORIES.flatMap((c) => c.items);

/** Destinos de la tab bar móvil (4 fijos + "Más" abre la hoja completa). */
export const MOBILE_TABS: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/inbox", label: "Chats", icon: MessageSquare, badge: true },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/contacts", label: "Contactos", icon: Users },
];

/* ============================================================
 * Modo personal DuqueLabs: tu CRM de 6 destinos. Los ~47 módulos
 * enterprise no se eliminan — viven en la hoja "Más" y en el
 * botón "Ver todos los módulos" del sidebar.
 * ============================================================ */

/** localStorage: "false" desactiva el modo personal (modo completo). */
export const PERSONAL_MODE_KEY = "duquelabs_personal_mode";
/** Evento que avisa a las navigaciones que cambió el modo. */
export const PERSONAL_MODE_EVENT = "duquelabs-mode";

export function isPersonalMode(): boolean {
  if (typeof window === "undefined") return true; // por defecto: lo tuyo
  try {
    return localStorage.getItem(PERSONAL_MODE_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Los 6 destinos del plan personal (Correos entra cuando exista Gmail). */
export const PERSONAL_NAV: NavItem[] = [
  { href: "/dashboard", label: "Hoy", icon: LayoutDashboard },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  { href: "/vault", label: "Bóveda", icon: Database },
  { href: "/notes", label: "Bóveda de ideas", icon: StickyNote },
  { href: "/contacts", label: "Contactos", icon: Users },
];

/** Tab bar en modo personal: 4 tuyos + "Más". */
export const PERSONAL_MOBILE_TABS: NavItem[] = [
  { href: "/dashboard", label: "Hoy", icon: LayoutDashboard },
  { href: "/calendar", label: "Agenda", icon: Calendar },
  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  { href: "/contacts", label: "Contactos", icon: Users },
];

/** Hoja "Más" en modo personal: "Lo tuyo" arriba + el resto agrupado. */
/** Hoja "Más" en modo personal: SOLO lo tuyo — los módulos enterprise
 *  quedan escondidos tras el botón "Ver todos los módulos". */
export function personalSheetCategories(): NavCategory[] {
  return [{ label: "Lo tuyo", items: PERSONAL_NAV }];
}
