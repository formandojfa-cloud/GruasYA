-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMember" BOOLEAN NOT NULL DEFAULT false,
    "membershipExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Provider" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "vehicleKind" TEXT NOT NULL,
    "vehicleLabel" TEXT,
    "plate" TEXT,
    "notes" TEXT,
    "pickupLat" REAL NOT NULL,
    "pickupLng" REAL NOT NULL,
    "pickupAddress" TEXT,
    "dropoffLat" REAL,
    "dropoffLng" REAL,
    "dropoffAddress" TEXT,
    "distanceKm" REAL NOT NULL,
    "isMemberAtRequest" BOOLEAN NOT NULL,
    "quoteJson" TEXT NOT NULL,
    "priceTotal" INTEGER NOT NULL,
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
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelledBy" TEXT,
    "cancelReason" TEXT,
    "cancellationFee" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DispatchOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "distanceKm" REAL NOT NULL,
    "offeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "response" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" DATETIME,
    CONSTRAINT "DispatchOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DispatchOffer_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EscalationAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "acknowledgedById" TEXT,
    "resolvedAt" DATETIME,
    CONSTRAINT "EscalationAlert_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EscalationAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "heading" REAL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LocationPing_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "byRole" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rating_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_accessToken_key" ON "Provider"("accessToken");

-- CreateIndex
CREATE INDEX "Provider_kind_status_idx" ON "Provider"("kind", "status");

-- CreateIndex
CREATE INDEX "Provider_h3Cell_idx" ON "Provider"("h3Cell");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "ServiceRequest_userId_createdAt_idx" ON "ServiceRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_providerId_status_idx" ON "ServiceRequest"("providerId", "status");

-- CreateIndex
CREATE INDEX "DispatchOffer_requestId_response_idx" ON "DispatchOffer"("requestId", "response");

-- CreateIndex
CREATE INDEX "DispatchOffer_providerId_response_idx" ON "DispatchOffer"("providerId", "response");

-- CreateIndex
CREATE INDEX "EscalationAlert_resolvedAt_createdAt_idx" ON "EscalationAlert"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "LocationPing_providerId_at_idx" ON "LocationPing"("providerId", "at");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_at_idx" ON "RequestEvent"("requestId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_requestId_byRole_key" ON "Rating"("requestId", "byRole");
