import { getSql } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { checkRateLimit as memCheck } from "@/lib/rate-limit";

/**
 * Ventana deslizante respaldada en Postgres: a diferencia del Map en memoria
 * (uno por lambda en Vercel), el contador es global para la app. Si la BD no
 * responde, degrada al limitador en memoria antes que bloquear el login.
 */

export async function checkRateLimitDb(
  key: string,
  opts: { windowMs: number; max: number }
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const pg = getSql();
    await pg`insert into rate_limit_hit (id, bucket_key, at) values (${newId("rateLimitHit")}, ${key}, now())`;
    const rows = await pg`
      select count(*)::int as n
      from rate_limit_hit
      where bucket_key = ${key}
        and at > now() - (${opts.windowMs} * interval '1 millisecond')
    `;
    // limpieza oportunista (~5% de las llamadas) para que la tabla no crezca
    if (Math.random() < 0.05) {
      await pg`delete from rate_limit_hit where at < now() - interval '2 hours'`;
    }
    const n = rows[0]?.n ?? 0;
    return { allowed: n <= opts.max, remaining: Math.max(0, opts.max - n) };
  } catch (err) {
    console.error("[rate-limit-db] fallo de BD, usando memoria:", err);
    return memCheck(key, opts);
  }
}
