import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Una sola instancia por proceso (en desarrollo, Next recarga módulos y sin
// esto se abrirían conexiones nuevas en cada cambio).
const globalForPrisma = globalThis as unknown as { __rsPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL (cadena de conexión de PostgreSQL / Supabase)");
  // Supabase: usa el "Session pooler" (puerto 5432) o el "Transaction pooler" (6543).
  // Pocas conexiones por proceso: el pooler de Supabase ya reparte entre clientes.
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__rsPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__rsPrisma = prisma;
