"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  Globe,
  Linkedin,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

/**
 * Contactos — tarjetas de dos renglones sobre datos reales (/api/crm/contacts):
 * avatar (foto o iniciales con gradiente), empresa/cargo, etiquetas y acciones
 * rápidas (WhatsApp, llamada, correo, Instagram, LinkedIn). Al agregar un
 * número se "enriquece" solo: enlaces directos y foto de perfil pública de
 * Instagram cuando es posible. Rápido: un solo fetch + filtro en memoria.
 */

type Contacto = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  role: string;
  image: string;
  tags: string[];
};

const GRADIENTES = [
  "from-[#0a6cff] to-[#053680]",
  "from-[#5856d6] to-[#3634a3]",
  "from-[#ff9f0a] to-[#c25e00]",
  "from-[#34c759] to-[#1d7f3d]",
  "from-[#ff2d55] to-[#c81e43]",
  "from-[#30b0c7] to-[#1d7f94]",
];

function gradienteDe(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 997;
  return GRADIENTES[h % GRADIENTES.length]!;
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function digits(tel: string): string {
  return tel.replace(/\D/g, "");
}

export default function ContactsPage() {
  const [contactos, setContactos] = useState<Contacto[] | null>(null);
  const [q, setQ] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "", role: "", instagram: "", tags: "" });
  const [enrique, setEnrique] = useState<null | { enlaces: Record<string, string>; avatarUrl: string | null; note: string }>(null);
  const [enriqueciendo, setEnriqueciendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    // Un solo fetch: el filtrado es en memoria (instantáneo).
    fetch("/api/crm/contacts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContactos(Array.isArray(d?.contacts) ? d.contacts : []))
      .catch(() => setContactos([]));
  }, []);

  function flash(m: string) {
    setMensaje(m);
    setTimeout(() => setMensaje(""), 3500);
  }

  const visibles = useMemo(() => {
    const lista = contactos ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return lista;
    return lista.filter(
      (c) =>
        c.name.toLowerCase().includes(qq) ||
        c.company.toLowerCase().includes(qq) ||
        c.phone.includes(qq) ||
        c.tags.some((t) => t.toLowerCase().includes(qq))
    );
  }, [contactos, q]);

  /** Enriquecimiento: enlaces por teléfono/nombre + foto de Instagram. */
  async function enriquecerAhora() {
    setEnriqueciendo(true);
    const res = await fetch("/api/crm/contacts/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, phone: form.phone, instagram: form.instagram }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setEnriqueciendo(false);
    if (res?.ok) {
      setEnrique({ enlaces: res.enlaces ?? {}, avatarUrl: res.avatarUrl, note: res.note });
    } else {
      setEnrique({ enlaces: {}, avatarUrl: null, note: "No pude enriquecer ahora — guarda igual" });
    }
  }

  async function guardar() {
    if (!form.name.trim()) return;
    setGuardando(true);
    const ok = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        email: form.email,
        company: form.company,
        role: form.role,
        image: enrique?.avatarUrl ?? "",
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    setGuardando(false);
    if (ok) {
      setAgregando(false);
      setForm({ name: "", phone: "", email: "", company: "", role: "", instagram: "", tags: "" });
      setEnrique(null);
      flash("Contacto guardado ✅");
      fetch("/api/crm/contacts")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setContactos(Array.isArray(d?.contacts) ? d.contacts : []))
        .catch(() => {});
    } else {
      flash("No se pudo guardar");
    }
  }

  async function eliminar(id: string) {
    if (!window.confirm("¿Eliminar este contacto?")) return;
    setContactos((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    await fetch(`/api/crm/contacts/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-28 md:p-6 md:pb-6">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">Contactos</h2>
            <p className="text-xs text-muted-foreground md:text-sm">
              {contactos === null ? "Cargando…" : `${contactos.length} en tu red`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAgregando((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-transform active:scale-[0.97] md:text-sm"
          >
            {agregando ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
            {agregando ? "Cerrar" : "Agregar"}
          </button>
        </div>

        {mensaje && (
          <div className="rounded-xl border border-brand/30 bg-brand-tint/40 px-3 py-2 text-center text-xs font-medium">{mensaje}</div>
        )}

        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, empresa, teléfono o etiqueta…"
            className="w-full rounded-2xl border bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-brand focus:outline-none dark:bg-gray-900"
          />
        </div>

        {/* Formulario con enriquecimiento */}
        {agregando && (
          <div className="ios-fade-enter space-y-3 rounded-[24px] border bg-white p-4 shadow-sm dark:bg-gray-900">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre *" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none sm:col-span-2" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={enriquecerAhora} placeholder="WhatsApp (ej. 573001234567)" inputMode="tel" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
              <input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} onBlur={enriquecerAhora} placeholder="@instagram" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Correo" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Empresa" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Cargo" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Etiquetas (coma)" className="rounded-xl border bg-background px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
            </div>

            {enrique && (
              <div className="rounded-xl bg-brand-tint/40 p-3">
                <div className="flex items-center gap-2">
                  {enrique.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={enrique.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-brand">
                      <Camera className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-xs font-semibold">
                      <Sparkles className="h-3.5 w-3.5 text-brand" /> {enrique.note}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {Object.entries(enrique.enlaces).map(([k, v]) => (
                        <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand shadow-sm">
                          {k === "whatsapp" ? "WhatsApp" : k === "instagram" ? "Instagram" : k === "linkedin" ? "LinkedIn" : "Google"} ↗
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={guardar}
              disabled={guardando || !form.name.trim()}
              className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar contacto"}
            </button>
          </div>
        )}

        {/* Lista de tarjetas de dos renglones */}
        {contactos === null ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-[22px] border bg-white p-3.5 dark:bg-gray-900">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <div className="rounded-[24px] border border-dashed p-10 text-center">
            <p className="font-semibold">{contactos.length === 0 ? "Aún no tienes contactos" : "Nada con ese filtro"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Agrega el primero con el botón de arriba ✨</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibles.map((c, i) => {
              const abierto = expandido === c.id;
              const wa = digits(c.phone);
              return (
                <div
                  key={c.id}
                  className="ios-fade-enter overflow-hidden rounded-[22px] border bg-white shadow-sm transition-all dark:bg-gray-900"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <button type="button" onClick={() => setExpandido(abierto ? null : c.id)} className="flex w-full items-center gap-3 p-3.5 text-left active:scale-[0.99]">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt={c.name} className="h-12 w-12 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[15px] font-extrabold text-white ${gradienteDe(c.name)}`}>
                        {iniciales(c.name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <b className="truncate text-[15px] font-bold">{c.name}</b>
                        {c.role && <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">{c.role}</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {c.company && <span className="truncate">{c.company}</span>}
                        {c.company && c.tags.length > 0 && <span>·</span>}
                        {c.tags.slice(0, 2).map((t) => (
                          <span key={t} className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold text-brand">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`} />
                  </button>

                  {abierto && (
                    <div className="ios-fade-enter border-t bg-muted/20 px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {wa.length >= 8 && (
                          <>
                            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#34c759]/15 px-3 py-1.5 text-[11px] font-bold text-[#1d7f3d]">
                              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                            </a>
                            <a href={`tel:+${wa}`} className="flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-[11px] font-bold text-brand">
                              <Phone className="h-3.5 w-3.5" /> Llamar
                            </a>
                          </>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 rounded-full bg-[#5856d6]/10 px-3 py-1.5 text-[11px] font-bold text-[#403ed8]">
                            <Mail className="h-3.5 w-3.5" /> Correo
                          </a>
                        )}
                        <a href={`https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(c.name)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-[#30b0c7]/10 px-3 py-1.5 text-[11px] font-bold text-[#1d7f94]">
                          <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                        </a>
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(c.name)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
                          <Globe className="h-3.5 w-3.5" /> Buscar
                        </a>
                        <button type="button" onClick={() => eliminar(c.id)} className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-bold text-[#ff3b30]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {(c.phone || c.email) && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {c.phone && <>📱 +{wa} </>}
                          {c.email && <>· ✉️ {c.email}</>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
