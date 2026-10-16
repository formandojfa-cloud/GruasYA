/**
 * Las pruebas unitarias del motor de despacho usan una base SQLite propia
 * (tests/unit/.test.db) creada con las migraciones reales. Así se prueba la
 * lógica tal cual corre en producción, sin tocar prisma/dev.db.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.resolve(__dirname, ".test.db");
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.AUTH_SECRET = "test-secret";
process.env.PBX_PASSWORD = "test-pbx";
process.env.DISPATCH_TICKER = "off";
// Sin red en pruebas: el motor de rutas usa siempre la estimación en línea recta (determinista).
process.env.ROUTES_PROVIDER = "estimada";
// Las pruebas fijan la tarifa con la que fueron escritas (banderazo Q275, Q20/km, sin km incluidos);
// la tarifa real por defecto vive en src/lib/config.ts y es editable por variables de entorno.
process.env.PRICE_TOW_BASE_Q = "275";
process.env.PRICE_TOW_INCLUDED_KM = "0";
process.env.PRICE_TOW_PER_KM_Q = "20";

for (const f of [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}
execSync("npx prisma migrate deploy", {
  cwd: path.resolve(__dirname, "../.."),
  env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  stdio: "pipe",
});
