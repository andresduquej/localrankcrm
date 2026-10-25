import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Estadísticas del mes en tareas: cuántas se completaron, cuántas quedan
 * pendientes, tasa de completadas y tiempo promedio de realización (de la
 * creación a la marca de hecha). Todo en hora Bogotá.
 */

export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      done: schema.crmTask.done,
      createdAt: schema.crmTask.createdAt,
      updatedAt: schema.crmTask.updatedAt,
    })
    .from(schema.crmTask)
    .where(eq(schema.crmTask.organizationId, session.organizationId))
    .limit(2000);

  // Mes actual en pared Bogotá (UTC-5)
  const wall = new Date(Date.now() - 5 * 3600_000);
  const mesIniWall = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1));
  const mesIni = new Date(mesIniWall.getTime() + 5 * 3600_000);

  const hechasMes = rows.filter(
    (t) => t.done && t.updatedAt.getTime() >= mesIni.getTime()
  );
  const pendientes = rows.filter((t) => !t.done);
  const hechasHoy = rows.filter(
    (t) => t.done && t.updatedAt.getTime() >= Date.now() - 24 * 3600_000
  );

  // Tiempo promedio de realización (creación → hecha) de las del mes
  let promedioMs: number | null = null;
  if (hechasMes.length > 0) {
    const total = hechasMes.reduce(
      (acc, t) => acc + Math.max(0, t.updatedAt.getTime() - t.createdAt.getTime()),
      0
    );
    promedioMs = total / hechasMes.length;
  }

  const base = hechasMes.length + pendientes.length;
  return Response.json({
    mes: `${["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][wall.getUTCMonth()]} ${wall.getUTCFullYear()}`,
    completadasMes: hechasMes.length,
    completadasHoy: hechasHoy.length,
    pendientes: pendientes.length,
    tasa: base > 0 ? Math.round((hechasMes.length / base) * 100) : null,
    tiempoPromedioMs: promedioMs,
  });
});
