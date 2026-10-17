/**
 * Las pruebas unitarias del motor de despacho usan una base PostgreSQL propia
 * (TEST_DATABASE_URL; por defecto la base gruaya_test de un Postgres local en
 * el puerto 5433) que se recrea con las migraciones reales. Así se prueba la
 * lógica tal cual corre en producción, sin tocar la base de desarrollo.
 */
import { resetDatabase } from "../../scripts/db-reset";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/gruaya_test";
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

await resetDatabase();
