import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Una sola instancia por proceso (en desarrollo, Next recarga módulos y sin
// esto se abrirían conexiones nuevas en cada cambio). Se crea en el primer uso,
// no al importar: así `next build` no necesita DATABASE_URL (p. ej. en Docker).
const globalForPrisma = globalThis as unknown as { __rsPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL (cadena de conexión de PostgreSQL / Supabase)");
  // Supabase: usa el "Session pooler" (puerto 5432) o el "Transaction pooler" (6543).
  // Pocas conexiones por proceso: el pooler de Supabase ya reparte entre clientes.
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.__rsPrisma) globalForPrisma.__rsPrisma = createClient();
  return globalForPrisma.__rsPrisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver === undefined ? client : client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
