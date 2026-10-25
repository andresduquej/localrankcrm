import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Resumen del dashboard en UNA petición: citas, tareas, KPIs (contactos,
 * sin leer), recursos y proveedores. Los conteos se calculan en SQL — nada
 * de bajar listas completas para contar en cliente.
 */

export const GET = withAuth(async (session) => {
  const db = getDb();
  const [usuario, citas, tareas, contactos, sinLeer, recursos, proveedores, nProveedoresRows] = await Promise.all([
    // Nombre para el saludo
    db
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, session.userId))
      .limit(1),

    // Próximas citas (no completadas, desde hace 1h)
    db
      .select({
        title: schema.appointment.title,
        startsAt: schema.appointment.startsAt,
        notes: schema.appointment.notes,
      })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, session.organizationId),
          gt(schema.appointment.startsAt, new Date(Date.now() - 3600_000)),
          isNull(schema.appointment.completedAt)
        )
      )
      .orderBy(asc(schema.appointment.startsAt))
      .limit(4),

    // Pendientes (50 bastan para la lista, vencidas y la semana)
    db
      .select({
        id: schema.crmTask.id,
        title: schema.crmTask.title,
        priority: schema.crmTask.priority,
        dueDate: schema.crmTask.dueDate,
      })
      .from(schema.crmTask)
      .where(
        and(
          eq(schema.crmTask.organizationId, session.organizationId),
          eq(schema.crmTask.done, false)
        )
      )
      .orderBy(
        asc(sql`case when ${schema.crmTask.dueDate} = '' then 1 else 0 end`),
        asc(schema.crmTask.dueDate)
      )
      .limit(50),

    // KPI: contactos activos
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.contact)
      .where(
        and(
          eq(schema.contact.organizationId, session.organizationId),
          sql`${schema.contact.archivedAt} is null`
        )
      ),

    // KPI: mensajes sin leer (suma, sin bajar conversaciones)
    db
      .select({ n: sql<number>`coalesce(sum(${schema.conversation.unreadCount}), 0)::int` })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.organizationId, session.organizationId),
          eq(schema.conversation.isTest, false)
        )
      ),

    // Últimos 3 recursos (livianos) + total
    db
      .select({
        id: schema.vaultItem.id,
        type: schema.vaultItem.type,
        title: schema.vaultItem.title,
        url: schema.vaultItem.url,
      })
      .from(schema.vaultItem)
      .where(
        and(
          eq(schema.vaultItem.organizationId, session.organizationId),
          eq(schema.vaultItem.archived, false)
        )
      )
      .orderBy(desc(schema.vaultItem.updatedAt))
      .limit(3),

    // Últimos 3 proveedores (livianos) + total
    db
      .select({
        id: schema.crmSupplier.id,
        type: schema.crmSupplier.type,
        title: schema.crmSupplier.title,
        url: schema.crmSupplier.url,
        rating: schema.crmSupplier.rating,
        tags: schema.crmSupplier.tags,
      })
      .from(schema.crmSupplier)
      .where(
        and(
          eq(schema.crmSupplier.organizationId, session.organizationId),
          eq(schema.crmSupplier.archived, false)
        )
      )
      .orderBy(desc(schema.crmSupplier.updatedAt))
      .limit(3),

    // Total de proveedores activos
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.crmSupplier)
      .where(
        and(
          eq(schema.crmSupplier.organizationId, session.organizationId),
          eq(schema.crmSupplier.archived, false)
        )
      ),
  ]);

  const [nContactos] = contactos;
  const [nSinLeer] = sinLeer;

  return Response.json({
    nombre: usuario[0]?.name?.trim().split(" ")[0] ?? "Andres",
    citas,
    tareas,
    nContactos: nContactos?.n ?? 0,
    sinLeer: nSinLeer?.n ?? 0,
    recursos,
    proveedores,
    nProveedores: nProveedoresRows[0]?.n ?? 0,
  });
});
