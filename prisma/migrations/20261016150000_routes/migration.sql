-- AlterTable: ruta por calles del remolque (ver src/lib/routes.ts)
ALTER TABLE "ServiceRequest" ADD COLUMN "estimatedMinutes" INTEGER;
ALTER TABLE "ServiceRequest" ADD COLUMN "routeSource" TEXT;
ALTER TABLE "ServiceRequest" ADD COLUMN "routeGeometry" TEXT;
