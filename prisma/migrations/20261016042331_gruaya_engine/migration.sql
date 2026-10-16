-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "banderazo" INTEGER NOT NULL DEFAULT 300,
    "kmIncluidos" REAL NOT NULL DEFAULT 10,
    "precioKm" REAL NOT NULL DEFAULT 15,
    "minutosIncluidos" REAL NOT NULL DEFAULT 15,
    "precioMinuto" REAL NOT NULL DEFAULT 3,
    "factorMoto" REAL NOT NULL DEFAULT 0.8,
    "factorCarro" REAL NOT NULL DEFAULT 1,
    "factorPickup" REAL NOT NULL DEFAULT 1.2,
    "recargoNocturno" REAL NOT NULL DEFAULT 1.2,
    "horaNocheInicio" INTEGER NOT NULL DEFAULT 22,
    "horaNocheFin" INTEGER NOT NULL DEFAULT 6,
    "recargoLluvia" REAL NOT NULL DEFAULT 1.15,
    "recargoLluviaFuerte" REAL NOT NULL DEFAULT 1.3,
    "comision" REAL NOT NULL DEFAULT 0.1,
    "fraccionCancelacion" REAL NOT NULL DEFAULT 0.5,
    "nonMemberTowFeeQ" INTEGER NOT NULL DEFAULT 50,
    "lightNonMemberFlatQ" INTEGER NOT NULL DEFAULT 150,
    "freeCancelMinutes" INTEGER NOT NULL DEFAULT 2,
    "offerSeconds" INTEGER NOT NULL DEFAULT 90,
    "radiiKm" TEXT NOT NULL DEFAULT '[5,10]',
    "locationFreshMs" INTEGER NOT NULL DEFAULT 120000,
    "rechazosParaPausar" INTEGER NOT NULL DEFAULT 3,
    "searchTimeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "maxOffers" INTEGER NOT NULL DEFAULT 5,
    "weather" TEXT NOT NULL DEFAULT 'NONE',
    "shareContactNumbers" BOOLEAN NOT NULL DEFAULT false,
    "requireLoadPhotos" BOOLEAN NOT NULL DEFAULT true,
    "requirePin" BOOLEAN NOT NULL DEFAULT true,
    "identityRequiredForTow" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PhoneCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plate" TEXT,
    "vehicleLabel" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lat" REAL,
    "lng" REAL,
    "heading" REAL,
    "h3Cell" TEXT,
    "lastSeenAt" DATETIME,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "accessToken" TEXT NOT NULL,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "vehicleType" TEXT NOT NULL DEFAULT 'PLATFORM',
    "identityStatus" TEXT NOT NULL DEFAULT 'NONE',
    "identityNote" TEXT,
    "identityReviewedAt" DATETIME,
    "consecutiveMissed" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Provider" ("accessToken", "createdAt", "h3Cell", "heading", "id", "isExternal", "kind", "lastSeenAt", "lat", "lng", "name", "phone", "photoUrl", "plate", "ratingCount", "ratingSum", "status", "vehicleLabel") SELECT "accessToken", "createdAt", "h3Cell", "heading", "id", "isExternal", "kind", "lastSeenAt", "lat", "lng", "name", "phone", "photoUrl", "plate", "ratingCount", "ratingSum", "status", "vehicleLabel" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE UNIQUE INDEX "Provider_accessToken_key" ON "Provider"("accessToken");
CREATE INDEX "Provider_kind_status_idx" ON "Provider"("kind", "status");
CREATE INDEX "Provider_h3Cell_idx" ON "Provider"("h3Cell");
CREATE TABLE "new_ServiceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "vehicleKind" TEXT NOT NULL,
    "vehicleLabel" TEXT,
    "plate" TEXT,
    "notes" TEXT,
    "problem" TEXT,
    "pickupLat" REAL NOT NULL,
    "pickupLng" REAL NOT NULL,
    "pickupAddress" TEXT,
    "dropoffLat" REAL,
    "dropoffLng" REAL,
    "dropoffAddress" TEXT,
    "distanceKm" REAL NOT NULL,
    "estimatedMinutes" REAL,
    "weatherAtRequest" TEXT,
    "routeSource" TEXT,
    "routeGeometry" TEXT,
    "isMemberAtRequest" BOOLEAN NOT NULL,
    "quoteJson" TEXT NOT NULL,
    "priceTotal" INTEGER NOT NULL,
    "commissionQ" REAL,
    "providerPayoutQ" REAL,
    "pin" TEXT NOT NULL,
    "providerId" TEXT,
    "assignedBy" TEXT,
    "searchEpoch" INTEGER NOT NULL DEFAULT 1,
    "searchStartedAt" DATETIME NOT NULL,
    "searchDeadlineAt" DATETIME NOT NULL,
    "escalatedAt" DATETIME,
    "escalationReason" TEXT,
    "assignedAt" DATETIME,
    "arrivedAt" DATETIME,
    "startedAt" DATETIME,
    "deliveredAt" DATETIME,
    "providerConfirmedCashAt" DATETIME,
    "clientConfirmedPaymentAt" DATETIME,
    "paidAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "cancellationFee" INTEGER NOT NULL DEFAULT 0,
    "cancellationFeeToProviderQ" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceRequest" ("arrivedAt", "assignedAt", "assignedBy", "cancelReason", "cancellationFee", "cancelledAt", "cancelledBy", "completedAt", "createdAt", "distanceKm", "dropoffAddress", "dropoffLat", "dropoffLng", "escalatedAt", "escalationReason", "id", "isMemberAtRequest", "kind", "notes", "pickupAddress", "pickupLat", "pickupLng", "pin", "plate", "priceTotal", "providerId", "quoteJson", "searchDeadlineAt", "searchEpoch", "searchStartedAt", "startedAt", "status", "updatedAt", "userId", "vehicleKind", "vehicleLabel") SELECT "arrivedAt", "assignedAt", "assignedBy", "cancelReason", "cancellationFee", "cancelledAt", "cancelledBy", "completedAt", "createdAt", "distanceKm", "dropoffAddress", "dropoffLat", "dropoffLng", "escalatedAt", "escalationReason", "id", "isMemberAtRequest", "kind", "notes", "pickupAddress", "pickupLat", "pickupLng", "pin", "plate", "priceTotal", "providerId", "quoteJson", "searchDeadlineAt", "searchEpoch", "searchStartedAt", "startedAt", "status", "updatedAt", "userId", "vehicleKind", "vehicleLabel" FROM "ServiceRequest";
DROP TABLE "ServiceRequest";
ALTER TABLE "new_ServiceRequest" RENAME TO "ServiceRequest";
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");
CREATE INDEX "ServiceRequest_userId_createdAt_idx" ON "ServiceRequest"("userId", "createdAt");
CREATE INDEX "ServiceRequest_providerId_status_idx" ON "ServiceRequest"("providerId", "status");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "membershipExpiresAt" DATETIME,
    "phoneVerifiedAt" DATETIME,
    "identityStatus" TEXT NOT NULL DEFAULT 'NONE',
    "identityNote" TEXT,
    "identityReviewedAt" DATETIME,
    "balanceDueQ" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "id", "isMember", "membershipExpiresAt", "name", "phone") SELECT "createdAt", "id", "isMember", "membershipExpiresAt", "name", "phone" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PhoneCode_phone_key" ON "PhoneCode"("phone");

-- CreateIndex
CREATE INDEX "MediaFile_ownerType_ownerId_kind_idx" ON "MediaFile"("ownerType", "ownerId", "kind");

-- CreateIndex
CREATE INDEX "MediaFile_requestId_kind_idx" ON "MediaFile"("requestId", "kind");

-- CreateIndex
CREATE INDEX "ChatMessage_requestId_at_idx" ON "ChatMessage"("requestId", "at");
