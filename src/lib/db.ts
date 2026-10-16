import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Una sola instancia por proceso (en desarrollo, Next recarga módulos y sin
// esto se abrirían conexiones nuevas en cada cambio).
const globalForPrisma = globalThis as unknown as { __rsPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
    // better-sqlite3 espera a que se libere el candado de escritura en vez de fallar.
    timeout: 5_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__rsPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__rsPrisma = prisma;
