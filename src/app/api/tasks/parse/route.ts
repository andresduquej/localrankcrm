import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { chatJson } from "@/lib/ai";
import { isAiConfigured } from "@/lib/env";
import { resolveProviderForOrg } from "@/server/ai/settings";
import { parseWhen } from "@/server/telegram/parse-when";
import { createTask } from "@/server/telegram/tasks";

export const dynamic = "force-dynamic";

/**
 * Entiende una tarea dictada o tipeada en texto libre ("llamar a Juan
 * mañana 3pm urgente") y la crea. La IA extrae título/prioridad/fecha;
 * sin IA cae al parser local de español (parseWhen + parseTaskText).
 */

const bodySchema = z.object({
  text: z.string().trim().min(3).max(500),
});

const ParsedTask = z.object({
  title: z.string().trim().min(1).max(200),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  when: z.string().trim().max(200).default(""),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const text = body.data.text;

  const provider = await resolveProviderForOrg(session.organizationId);
  let title = text;
  let priority: "high" | "medium" | "low" = "medium";
  let when = "";

  if (provider || isAiConfigured()) {
    const result = await chatJson(
      ParsedTask,
      [
        {
          role: "system",
          content:
            'Extraes tareas de texto libre en español (a menudo dictado). Devuelve SOLO JSON: {"title": la tarea en pocas palabras (sin fecha ni prioridad), "priority": "high" si dice urgente/alta, "low" si baja, si no "medium", "when": la fecha/hora en texto natural ("mañana 15:30", "el viernes 10am") o "" si no menciona}. Hora de Colombia.',
        },
        { role: "user", content: text },
      ],
      { provider: provider ?? undefined, timeoutMs: 20_000 }
    );
    if (result.ok) {
      // Los .default() del esquema hacen opcionales los tipos de entrada
      title = result.data.title ?? title;
      priority = result.data.priority ?? "medium";
      when = result.data.when ?? "";
    }
  }

  // Fecha: la dice la IA o la rescata el parser local del propio título.
  const parsed = parseWhen(when || title);
  const startsAt = parsed?.startsAt ?? null;

  const task = await createTask({
    organizationId: session.organizationId,
    title: parsed?.title && when ? parsed.title : title,
    priority,
    dueDate: startsAt,
  });
  return Response.json({ ok: true, task, source: provider || isAiConfigured() ? "ai" : "local" }, { status: 201 });
});
