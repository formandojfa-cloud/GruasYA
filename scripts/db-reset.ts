/**
 * Deja la base de DATABASE_URL vacía y con todas las migraciones aplicadas
 * (borra el esquema `public` y lo vuelve a crear). Lo usan las pruebas
 * unitarias y las e2e; también sirve para empezar de cero en desarrollo:
 *
 *   npm run db:reset          (y luego npm run db:seed)
 *
 * No lo corras contra la base de producción.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

export async function resetDatabase(connectionString = process.env.DATABASE_URL): Promise<void> {
  if (!connectionString) throw new Error("Falta DATABASE_URL");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "pipe",
  });
}

if (process.argv[1] && /db-reset\.ts$/.test(process.argv[1])) {
  resetDatabase()
    .then(() => console.log("Base reiniciada y migrada:", process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":***@")))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
