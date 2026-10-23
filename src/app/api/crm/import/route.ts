import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export const dynamic = "force-dynamic";

/**
 * Topes anti-abuso: máximo 500 ítems por colección y longitudes acotadas en
 * cada campo. El body crudo anterior permitía arrays sin límite (DoS de
 * escritura) y columnas arbitrarias.
 */
const MAX_ITEMS = 500;

const contactSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(320).optional(),
  company: z.string().max(200).optional(),
  role: z.string().max(120).optional(),
  image: z.string().max(1_000_000).optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.unknown()).max(100).optional(),
  customFields: z.array(z.unknown()).max(100).optional(),
  notes: z.array(z.unknown()).max(500).optional(),
  reminders: z.array(z.unknown()).max(500).optional(),
  createdAt: z.string().max(64).optional(),
});

const taskSchema = z.object({
  id: z.string().max(64).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(100_000).optional(),
  priority: z.string().max(20).optional(),
  status: z.string().max(30).optional(),
  dueDate: z.string().max(30).optional(),
  assignee: z.string().max(200).optional(),
  relatedTo: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  tags: z.array(z.unknown()).max(100).optional(),
  done: z.boolean().optional(),
  createdAt: z.string().max(64).optional(),
});

const noteSchema = z.object({
  id: z.string().max(64).optional(),
  title: z.string().max(300).optional(),
  content: z.string().max(100_000).optional(),
  image: z.string().max(1_000_000).optional(),
  relatedTo: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
  tags: z.array(z.unknown()).max(100).optional(),
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
  createdAt: z.string().max(64).optional(),
});

const importSchema = z
  .object({
    contacts: z.array(contactSchema).max(MAX_ITEMS).optional(),
    tasks: z.array(taskSchema).max(MAX_ITEMS).optional(),
    notes: z.array(noteSchema).max(MAX_ITEMS).optional(),
  })
  .strict();

/**
 * POST /api/crm/import
 * Imports localStorage backup data into Supabase tables.
 * Expects { contacts: [...], tasks: [...], notes: [...] }
 */
export const POST = withAuth(async (session, req: Request) => {
  const parsed = await parseBody(req, importSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const orgId = session.organizationId;
  const db = getDb();
  const results = { contacts: 0, tasks: 0, notes: 0 };

  // Import contacts
  const contacts = body.contacts ?? [];
  for (const c of contacts) {
    try {
      await db.insert(schema.crmContact).values({
        id: c.id || newId("crmContact"),
        organizationId: orgId,
        name: c.name || "",
        phone: c.phone || "",
        email: c.email || "",
        company: c.company || "",
        role: c.role || "",
        image: c.image || "",
        archived: c.archived || false,
        tags: c.tags || [],
        customFields: c.customFields || [],
        notes: c.notes || [],
        reminders: c.reminders || [],
        createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      }).onConflictDoNothing();
      results.contacts++;
    } catch (e) {
      // Skip duplicates or invalid entries
    }
  }

  // Import tasks
  const tasks = body.tasks ?? [];
  for (const t of tasks) {
    try {
      await db.insert(schema.crmTask).values({
        id: t.id || newId("crmTask"),
        organizationId: orgId,
        title: t.title || "",
        description: t.description || "",
        priority: t.priority || "medium",
        status: t.status || "pending",
        dueDate: t.dueDate || "",
        assignee: t.assignee || "",
        relatedTo: t.relatedTo || "",
        category: t.category || "",
        tags: t.tags || [],
        done: t.done || false,
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      }).onConflictDoNothing();
      results.tasks++;
    } catch (e) {
      // Skip
    }
  }

  // Import notes
  const notes = body.notes ?? [];
  for (const n of notes) {
    try {
      await db.insert(schema.crmNote).values({
        id: n.id || newId("crmNote"),
        organizationId: orgId,
        title: n.title || "",
        content: n.content || "",
        image: n.image || "",
        relatedTo: n.relatedTo || "",
        category: n.category || "General",
        tags: n.tags || [],
        pinned: n.pinned || false,
        locked: n.locked || false,
        createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
      }).onConflictDoNothing();
      results.notes++;
    } catch (e) {
      // Skip
    }
  }

  return Response.json({ ok: true, imported: results });
});
