import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { Operator, Provider, User } from "@/generated/prisma/client";
import { SESSION } from "./config";
import { prisma } from "./db";

/**
 * Sesiones firmadas con HMAC en cookies httpOnly. Suficiente para el MVP; en
 * producción el alta de clientes debe verificar el teléfono con un código SMS/
 * WhatsApp (ver docs/ARCHITECTURE.md → Seguridad).
 */

const SECRET = process.env.AUTH_SECRET ?? "dev-only-change-me";
if (process.env.NODE_ENV === "production" && SECRET === "dev-only-change-me") {
  throw new Error("AUTH_SECRET debe definirse en producción");
}

function hmac(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

export function signValue(value: string): string {
  return `${value}.${hmac(value)}`;
}

export function verifyValue(token: string | undefined | null): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = hmac(value);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

type CookieName = (typeof SESSION)[keyof Pick<typeof SESSION, "cookieClient" | "cookieProvider" | "cookieOperator">];

export async function setSession(name: CookieName, id: string): Promise<void> {
  const store = await cookies();
  store.set(name, signValue(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION.maxAgeSeconds,
  });
}

export async function clearSession(name: CookieName): Promise<void> {
  const store = await cookies();
  store.delete(name);
}

async function readSession(name: CookieName): Promise<string | null> {
  const store = await cookies();
  return verifyValue(store.get(name)?.value);
}

export async function getClientUser(): Promise<User | null> {
  const id = await readSession(SESSION.cookieClient);
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function getProvider(): Promise<Provider | null> {
  const id = await readSession(SESSION.cookieProvider);
  if (!id) return null;
  return prisma.provider.findUnique({ where: { id } });
}

export async function getOperator(): Promise<Operator | null> {
  const id = await readSession(SESSION.cookieOperator);
  if (!id) return null;
  return prisma.operator.findUnique({ where: { id } });
}

export function newAccessToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function newPin(): string {
  return String(crypto.randomInt(0, 10_000)).padStart(4, "0");
}

export function pbxPasswordMatches(password: string): boolean {
  const expected = process.env.PBX_PASSWORD ?? "";
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
