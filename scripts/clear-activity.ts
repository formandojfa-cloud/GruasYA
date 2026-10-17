/**
 * Borra la actividad (solicitudes, ofertas, alertas, pings) y deja a todos los
 * proveedores desconectados. Conserva clientes y proveedores de la red. Útil
 * para repetir una demo o una prueba sin reiniciar la base.
 *
 *   npm run db:clear-activity
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const requests = await prisma.serviceRequest.deleteMany();
  const pings = await prisma.locationPing.deleteMany();
  const externals = await prisma.provider.deleteMany({ where: { isExternal: true } });
  const offline = await prisma.provider.updateMany({ data: { status: "OFFLINE", lastSeenAt: null } });
  console.log("Actividad borrada:", {
    requests: requests.count,
    pings: pings.count,
    externalProvidersRemoved: externals.count,
    providersOffline: offline.count,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
