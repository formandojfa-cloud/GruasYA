/**
 * Fotos y videos (identidad y evidencias de carga) guardados en disco bajo
 * `UPLOAD_DIR` con nombre aleatorio; la BD (`MediaFile`) guarda quién lo subió,
 * de qué tipo es y su ruta. Límites: 4 MB por imagen, 25 MB por video; solo
 * image/jpeg|png|webp y video/mp4|webm.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MediaFile } from "@/generated/prisma/client";
import type { MediaKind, MediaOwnerType } from "@/generated/prisma/enums";
import { UPLOAD_DIR } from "./config";
import { prisma } from "./db";
import { DispatchError } from "./dispatch";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

const IMAGE_MIMES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VIDEO_MIMES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };

export const MEDIA_KINDS: readonly MediaKind[] = [
  "DPI_FRONT",
  "DPI_BACK",
  "SELFIE",
  "LICENSE",
  "VEHICLE_DOC",
  "LOAD_PHOTO",
  "LOAD_VIDEO",
];

export const IDENTITY_KINDS_USER: readonly MediaKind[] = ["DPI_FRONT", "DPI_BACK", "SELFIE"];
export const IDENTITY_KINDS_PROVIDER: readonly MediaKind[] = ["DPI_FRONT", "DPI_BACK", "SELFIE", "LICENSE", "VEHICLE_DOC"];

export function isVideoKind(kind: MediaKind): boolean {
  return kind === "LOAD_VIDEO";
}

export function uploadRoot(): string {
  return path.resolve(process.cwd(), UPLOAD_DIR);
}

/** Valida tipo y tamaño; devuelve la extensión. Lanza `DispatchError` 400/413. */
export function validateUpload(kind: MediaKind, mime: string, size: number): string {
  const video = isVideoKind(kind);
  const table = video ? VIDEO_MIMES : IMAGE_MIMES;
  const ext = table[mime.toLowerCase()];
  if (!ext) {
    throw new DispatchError(
      "UNSUPPORTED_MEDIA",
      video ? "Sube un video MP4 o WebM" : "Sube una foto JPG, PNG o WebP",
      400,
    );
  }
  if (size <= 0) throw new DispatchError("EMPTY_FILE", "El archivo está vacío", 400);
  const max = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (size > max) {
    throw new DispatchError("FILE_TOO_LARGE", video ? "El video pesa más de 25 MB" : "La foto pesa más de 4 MB", 413);
  }
  return ext;
}

export type SaveMediaInput = {
  kind: MediaKind;
  ownerType: MediaOwnerType;
  ownerId: string;
  requestId?: string | null;
  mime: string;
  bytes: Uint8Array;
  now?: Date;
};

/**
 * Guarda el archivo en disco y registra la fila. Para los tipos de identidad
 * (una foto por tipo) reemplaza la anterior del mismo dueño.
 */
export async function saveMedia(input: SaveMediaInput): Promise<MediaFile> {
  const ext = validateUpload(input.kind, input.mime, input.bytes.byteLength);
  const now = input.now ?? new Date();
  const sub = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const rel = path.join(sub, name);
  const dir = path.join(uploadRoot(), sub);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), input.bytes, { flag: "wx" });

  const row = await prisma.mediaFile.create({
    data: {
      kind: input.kind,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      requestId: input.requestId ?? null,
      mime: input.mime.toLowerCase(),
      size: input.bytes.byteLength,
      path: rel,
      createdAt: now,
    },
  });
  if (!input.kind.startsWith("LOAD_")) {
    // Identidad: una foto vigente por tipo.
    const old = await prisma.mediaFile.findMany({
      where: { ownerType: input.ownerType, ownerId: input.ownerId, kind: input.kind, id: { not: row.id } },
    });
    for (const o of old) await deleteMedia(o);
  }
  return row;
}

export async function deleteMedia(m: MediaFile): Promise<void> {
  await prisma.mediaFile.deleteMany({ where: { id: m.id } });
  await fs.rm(path.join(uploadRoot(), m.path), { force: true }).catch(() => undefined);
}

export function mediaAbsolutePath(m: Pick<MediaFile, "path">): string {
  const abs = path.resolve(uploadRoot(), m.path);
  if (!abs.startsWith(uploadRoot())) throw new DispatchError("NOT_FOUND", "Archivo no encontrado", 404);
  return abs;
}

/** Fotos vigentes de un dueño, por tipo (ids). */
export async function mediaByKind(ownerType: MediaOwnerType, ownerId: string): Promise<Partial<Record<MediaKind, string>>> {
  const rows = await prisma.mediaFile.findMany({
    where: { ownerType, ownerId, requestId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true },
  });
  const out: Partial<Record<MediaKind, string>> = {};
  for (const r of rows) out[r.kind] = r.id;
  return out;
}

export type Viewer =
  | { role: "CLIENT"; userId: string }
  | { role: "PROVIDER"; providerId: string }
  | { role: "PBX"; operatorId: string };

/**
 * Quién puede ver un archivo: su dueño, la central, y en las evidencias de un
 * servicio (requestId) el cliente de ese servicio y el gruero asignado.
 */
export async function canViewMedia(m: MediaFile, viewer: Viewer): Promise<boolean> {
  if (viewer.role === "PBX") return true;
  if (viewer.role === "CLIENT" && m.ownerType === "USER" && m.ownerId === viewer.userId) return true;
  if (viewer.role === "PROVIDER" && m.ownerType === "PROVIDER" && m.ownerId === viewer.providerId) return true;
  if (!m.requestId) return false;
  const req = await prisma.serviceRequest.findUnique({
    where: { id: m.requestId },
    select: { userId: true, providerId: true },
  });
  if (!req) return false;
  if (viewer.role === "CLIENT") return req.userId === viewer.userId;
  return req.providerId === viewer.providerId;
}
