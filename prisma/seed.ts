/**
 * Datos de arranque para desarrollo y demos. Idempotente: se puede correr
 * varias veces. `npm run db:seed`.
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

const inOneYear = new Date(Date.now() + 365 * 24 * 3600_000);

async function main() {
  // Clientes: una socia y un no socio.
  const ana = await prisma.user.upsert({
    where: { phone: "55550001" },
    create: { phone: "55550001", name: "Ana López", isMember: true, membershipExpiresAt: inOneYear },
    update: { isMember: true, membershipExpiresAt: inOneYear },
  });
  await prisma.vehicle.deleteMany({ where: { userId: ana.id } });
  await prisma.vehicle.create({ data: { userId: ana.id, plate: "P123ABC", label: "Toyota Corolla gris", kind: "SEDAN" } });

  await prisma.user.upsert({
    where: { phone: "55550002" },
    create: { phone: "55550002", name: "Carlos Pérez", isMember: false },
    update: { isMember: false },
  });

  // Operador del PBX.
  if (!(await prisma.operator.findFirst({ where: { name: "Operador" } }))) {
    await prisma.operator.create({ data: { name: "Operador" } });
  }

  // Proveedores. Tokens fijos para poder entrar en /driver?token=… durante la demo.
  const providers = [
    { token: "tow-zona10", name: "Grúas Rodríguez", phone: "40000001", kind: "TOW", plate: "C456DEF", vehicleLabel: "Grúa de plataforma Hino", lat: 14.5995, lng: -90.5069 },
    { token: "tow-zona11", name: "Grúas El Rápido", phone: "40000002", kind: "TOW", plate: "C789GHI", vehicleLabel: "Grúa de arrastre Isuzu", lat: 14.6151, lng: -90.5569 },
    { token: "tow-mixco", name: "Grúas Mixco 24/7", phone: "40000003", kind: "TOW", plate: "C101JKL", vehicleLabel: "Grúa de plataforma Freightliner", lat: 14.6333, lng: -90.6064 },
    { token: "tow-villanueva", name: "Grúas del Sur", phone: "40000004", kind: "TOW", plate: "C202MNO", vehicleLabel: "Grúa de arrastre Kia", lat: 14.5269, lng: -90.5875 },
    { token: "moto-centro", name: "Luis Motorista", phone: "40000005", kind: "MOTO", plate: "M303PQR", vehicleLabel: "Moto con kit de llanta y batería", lat: 14.6349, lng: -90.5069 },
    { token: "moto-zona15", name: "Pedro Motorista", phone: "40000006", kind: "MOTO", plate: "M404STU", vehicleLabel: "Moto con compresor y arrancador", lat: 14.6097, lng: -90.4846 },
  ] as const;

  for (const p of providers) {
    await prisma.provider.upsert({
      where: { accessToken: p.token },
      create: {
        accessToken: p.token,
        name: p.name,
        phone: p.phone,
        kind: p.kind,
        plate: p.plate,
        vehicleLabel: p.vehicleLabel,
        status: "OFFLINE",
        lat: p.lat,
        lng: p.lng,
      },
      update: { name: p.name, phone: p.phone, kind: p.kind, plate: p.plate, vehicleLabel: p.vehicleLabel },
    });
  }

  const counts = {
    users: await prisma.user.count(),
    providers: await prisma.provider.count(),
    operators: await prisma.operator.count(),
  };
  console.log("Seed listo:", counts);
  console.log("Enlaces de proveedores de prueba: /driver?token=" + providers.map((p) => p.token).join(" | "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
