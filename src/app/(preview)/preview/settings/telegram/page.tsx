"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Loader2, RefreshCw, Send, Trash2, Unplug } from "lucide-react";

type Connection = {
  botUsername: string;
  tokenLast4: string;
  chatLinked: boolean;
  chatName: string | null;
};

export default function TelegramSettingsPage() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/telegram")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConn(d?.connection ?? null))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function connect() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settings/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "No se pudo conectar con Telegram");
        return;
      }
      setToken("");
      setNotice(`Bot @${data.botUsername} conectado. Ahora ábrelo en Telegram y mándale /start.`);
      const refreshed = await fetch("/api/settings/telegram").then((r) => r.json());
      setConn(refreshed?.connection ?? null);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting("testing");
    try {
      const res = await fetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      setTesting(res.ok ? "ok" : "error");
    } catch {
      setTesting("error");
    }
  }

  async function checkReminders() {
    setChecking(true);
    try {
      const res = await fetch("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      setNotice(res.ok ? `Recordatorios revisados: ${data.sent ?? 0} enviados.` : "No se pudo revisar.");
    } finally {
      setChecking(false);
    }
  }

  async function disconnect() {
    if (!confirm("¿Desconectar el bot de Telegram? Las citas agendadas se conservan.")) return;
    await fetch("/api/settings/telegram", { method: "DELETE" });
    setConn(null);
    setNotice("Bot desconectado.");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Bot className="h-5 w-5 text-brand" /> Telegram
        </h1>
        <p className="text-xs text-muted-foreground">
          Recibe recordatorios de citas y agenda conversando con tu bot.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : conn ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>
              Bot <strong>@{conn.botUsername}</strong> conectado (token ••••{conn.tokenLast4})
            </span>
          </div>
          <div className="text-sm">
            {conn.chatLinked ? (
              <p>✅ Chat vinculado{conn.chatName ? ` (${conn.chatName})` : ""}. El bot te avisará de tus citas.</p>
            ) : (
              <p className="text-amber-700">
                Falta el último paso: abre tu bot en Telegram y mándale <code>/start</code>.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={test}
              disabled={testing === "testing"}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {testing === "testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Mensaje de prueba
            </button>
            <button
              onClick={checkReminders}
              disabled={checking}
              className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              Revisar recordatorios
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" /> Desconectar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border p-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              En Telegram, busca <strong>@BotFather</strong> y mándale{" "}
              <code>/newbot</code>.
            </li>
            <li> Ponle nombre y usuario (debe terminar en "bot").</li>
            <li> Copia el token que te da (formato <code>123456:ABC-DEF…</code>) y pégalo abajo.</li>
            <li>
              Después de conectar, abre tu bot y mándale <code>/start</code>.
            </li>
          </ol>
          <div className="flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Pega aquí el token del bot"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button
              onClick={connect}
              disabled={saving || token.trim().length < 20}
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
              Conectar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
      )}

      <div className="rounded-lg border bg-gray-50 p-4 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Comandos del bot</p>
        <p><code>/cita reunión con Juan mañana 3pm</code> — agenda una cita</p>
        <p><code>/hoy</code> — citas de hoy · <code>/lista</code> — próximas · <code>/hecho texto</code> — marcar cumplida</p>
        <p className="mt-1">Te avisa una hora antes de cada cita (hora Colombia).</p>
      </div>
    </div>
  );
}
