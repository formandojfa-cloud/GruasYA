/**
 * Verificación de teléfono por código de 6 dígitos: una fila `PhoneCode` por
 * número, código guardado como HMAC(AUTH_SECRET), 10 min de vigencia, 5
 * intentos, un envío por minuto. Con Twilio Verify el código lo genera y
 * comprueba Twilio; aquí solo se controla la vigencia, los intentos y el ritmo.
 */
import crypto from "node:crypto";
import { prisma } from "./db";
import { DispatchError } from "./dispatch";
import { getSmsProvider, type SmsProvider } from "./sms";

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
export const RESEND_EVERY_MS = 60_000;
/** Tras verificar, cuánto tiempo puede completarse el registro sin otro código. */
export const VERIFIED_GRACE_MS = 10 * 60_000;

const SECRET = process.env.AUTH_SECRET ?? "dev-only-change-me";

export function hashCode(phone: string, code: string): string {
  return crypto.createHmac("sha256", SECRET).update(`${phone}:${code}`).digest("base64url");
}

export function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export type StartOptions = {
  now?: Date;
  /** Para pruebas: proveedor de envío. */
  provider?: SmsProvider;
};

export type StartResult = { channel: SmsProvider["name"]; expiresAt: Date; resendAt: Date };

export async function startPhoneVerification(phone: string, opts: StartOptions = {}): Promise<StartResult> {
  const now = opts.now ?? new Date();
  const provider = opts.provider ?? getSmsProvider();
  const existing = await prisma.phoneCode.findUnique({ where: { phone } });
  if (existing && now.getTime() - existing.sentAt.getTime() < RESEND_EVERY_MS) {
    throw new DispatchError("CODE_RATE_LIMITED", "Ya te enviamos un código; espera un minuto para pedir otro", 429);
  }
  const code = newCode();
  // Se envía antes de guardar: si el proveedor falla, no queda un código "fantasma".
  await provider.send(phone, code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await prisma.phoneCode.upsert({
    where: { phone },
    create: { phone, codeHash: provider.managesCode ? "" : hashCode(phone, code), expiresAt, attempts: 0, sentAt: now },
    update: { codeHash: provider.managesCode ? "" : hashCode(phone, code), expiresAt, attempts: 0, sentAt: now, verifiedAt: null },
  });
  return { channel: provider.name, expiresAt, resendAt: new Date(now.getTime() + RESEND_EVERY_MS) };
}

export type CheckOptions = { now?: Date; provider?: SmsProvider };

/**
 * Comprueba el código. Si ya se verificó hace poco (registro en dos pasos),
 * acepta sin volver a consultar al proveedor. Lanza `DispatchError` con
 * `CODE_EXPIRED`, `CODE_INVALID` o `CODE_ATTEMPTS_EXCEEDED`.
 */
export async function checkPhoneCode(phone: string, code: string, opts: CheckOptions = {}): Promise<void> {
  const now = opts.now ?? new Date();
  const row = await prisma.phoneCode.findUnique({ where: { phone } });
  if (!row) throw new DispatchError("CODE_EXPIRED", "Pide un código nuevo", 400);
  if (row.verifiedAt && now.getTime() - row.verifiedAt.getTime() < VERIFIED_GRACE_MS) return;
  if (row.expiresAt <= now) throw new DispatchError("CODE_EXPIRED", "El código venció; pide uno nuevo", 400);
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new DispatchError("CODE_ATTEMPTS_EXCEEDED", "Demasiados intentos; pide un código nuevo", 429);
  }
  await prisma.phoneCode.update({ where: { phone }, data: { attempts: { increment: 1 } } });

  const provider = opts.provider ?? getSmsProvider();
  let valid: boolean;
  if (row.codeHash === "" && provider.managesCode && provider.check) {
    valid = await provider.check(phone, code);
  } else {
    const a = Buffer.from(row.codeHash);
    const b = Buffer.from(hashCode(phone, code));
    valid = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  }
  if (!valid) {
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new DispatchError(
      "CODE_INVALID",
      left > 0 ? `Código incorrecto; te quedan ${left} intento${left === 1 ? "" : "s"}` : "Código incorrecto; pide uno nuevo",
      400,
    );
  }
  await prisma.phoneCode.update({ where: { phone }, data: { verifiedAt: now } });
}

/** Borra el código tras usarlo (registro completado). */
export async function consumePhoneCode(phone: string): Promise<void> {
  await prisma.phoneCode.deleteMany({ where: { phone } });
}
