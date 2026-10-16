/**
 * Verificación de identidad (manual desde Central → Conductores / Grueros):
 * el usuario o gruero sube DPI por ambos lados y selfie (el gruero además
 * licencia y papeles del vehículo), envía → PENDING; la central aprueba o
 * rechaza con nota. No hay aprobación automática.
 */
import type { IdentityStatus, MediaKind, MediaOwnerType } from "@/generated/prisma/enums";
import { prisma } from "./db";
import { DispatchError } from "./dispatch";
import { IDENTITY_KINDS_PROVIDER, IDENTITY_KINDS_USER, mediaByKind } from "./media";
import type { IdentityView } from "./types";

export function requiredKindsFor(ownerType: MediaOwnerType): readonly MediaKind[] {
  return ownerType === "USER" ? IDENTITY_KINDS_USER : IDENTITY_KINDS_PROVIDER;
}

type IdentityFields = { identityStatus: IdentityStatus; identityNote: string | null; identityReviewedAt: Date | null };

export async function identityViewFor(ownerType: MediaOwnerType, ownerId: string, row: IdentityFields): Promise<IdentityView> {
  const media = await mediaByKind(ownerType, ownerId);
  const required = requiredKindsFor(ownerType);
  return {
    status: row.identityStatus,
    note: row.identityNote,
    reviewedAt: row.identityReviewedAt?.toISOString() ?? null,
    media,
    required: [...required],
    missing: required.filter((k) => !media[k]),
  };
}

/** Envía la identidad a revisión. Requiere todas las fotos del rol. */
export async function submitIdentity(ownerType: MediaOwnerType, ownerId: string, now: Date = new Date()): Promise<IdentityView> {
  const row =
    ownerType === "USER"
      ? await prisma.user.findUnique({ where: { id: ownerId } })
      : await prisma.provider.findUnique({ where: { id: ownerId } });
  if (!row) throw new DispatchError("NOT_FOUND", "Cuenta no encontrada", 404);
  if (row.identityStatus === "APPROVED") {
    throw new DispatchError("IDENTITY_ALREADY_APPROVED", "Tu identidad ya está verificada", 409);
  }
  const media = await mediaByKind(ownerType, ownerId);
  const missing = requiredKindsFor(ownerType).filter((k) => !media[k]);
  if (missing.length) {
    throw new DispatchError("IDENTITY_INCOMPLETE", "Faltan fotos para enviar tu identidad a revisión", 400);
  }
  const data = { identityStatus: "PENDING" as IdentityStatus, identityNote: null, identityReviewedAt: null };
  const updated =
    ownerType === "USER"
      ? await prisma.user.update({ where: { id: ownerId }, data })
      : await prisma.provider.update({ where: { id: ownerId }, data });
  void now;
  return identityViewFor(ownerType, ownerId, updated);
}

export type IdentityDecision = "APPROVED" | "REJECTED";

/** Decisión de la central. Solo sobre una identidad PENDING (o para corregir una decisión previa). */
export async function decideIdentity(
  ownerType: MediaOwnerType,
  ownerId: string,
  decision: IdentityDecision,
  note: string | undefined,
  now: Date = new Date(),
): Promise<IdentityView> {
  const row =
    ownerType === "USER"
      ? await prisma.user.findUnique({ where: { id: ownerId } })
      : await prisma.provider.findUnique({ where: { id: ownerId } });
  if (!row) throw new DispatchError("NOT_FOUND", "Cuenta no encontrada", 404);
  if (row.identityStatus === "NONE") {
    throw new DispatchError("IDENTITY_NOT_SUBMITTED", "Todavía no ha enviado su identidad a revisión", 409);
  }
  const data = { identityStatus: decision as IdentityStatus, identityNote: note ?? null, identityReviewedAt: now };
  const updated =
    ownerType === "USER"
      ? await prisma.user.update({ where: { id: ownerId }, data })
      : await prisma.provider.update({ where: { id: ownerId }, data });
  return identityViewFor(ownerType, ownerId, updated);
}
