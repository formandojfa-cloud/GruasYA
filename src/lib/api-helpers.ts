import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { DispatchError } from "./dispatch";
import type { ApiError } from "./types";

export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(code: string, message: string, status: number, details?: unknown): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message, details } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new DispatchError("INVALID_JSON", "Cuerpo JSON inválido", 400);
  }
  return schema.parse(raw);
}

/**
 * Envuelve un handler: traduce errores de dominio y de validación a respuestas
 * JSON uniformes `{ error: { code, message } }`.
 */
export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof DispatchError) return fail(err.code, err.message, err.status);
      if (err instanceof ZodError) {
        return fail("VALIDATION", "Datos inválidos", 400, err.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
      }
      console.error(err);
      return fail("INTERNAL", "Error interno", 500);
    }
  };
}

export const unauthorized = () => fail("UNAUTHORIZED", "Inicia sesión", 401);
