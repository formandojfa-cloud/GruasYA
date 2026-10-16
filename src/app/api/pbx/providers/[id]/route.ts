import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOperator, newAccessToken } from "@/lib/auth";
import { fail, handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { DispatchError, setProviderStatus } from "@/lib/dispatch";
import { PhoneSchema } from "@/lib/types";
import { toProviderAdminView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  phone: PhoneSchema.optional(),
  plate: z.string().trim().max(12).nullable().optional(),
  vehicleLabel: z.string().trim().max(80).nullable().optional(),
  isExternal: z.boolean().optional(),
  /** Forzar desconexión (p. ej. gruero que no responde). */
  status: z.enum(["OFFLINE"]).optional(),
  /** Genera un enlace nuevo e invalida el anterior. */
  rotateToken: z.boolean().optional(),
});

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const { id } = await ctx.params;
  const input = await parseBody(req, PatchSchema);
  const existing = await prisma.provider.findUnique({ where: { id } });
  if (!existing) return fail("NOT_FOUND", "Proveedor no encontrado", 404);

  if (input.status === "OFFLINE" && existing.status !== "OFFLINE") {
    try {
      await setProviderStatus(id, "OFFLINE");
    } catch (err) {
      if (!(err instanceof DispatchError)) throw err;
      return fail(err.code, err.message, err.status);
    }
  }
  const { status: _s, rotateToken, ...fields } = input;
  const updated = await prisma.provider.update({
    where: { id },
    data: { ...fields, ...(rotateToken ? { accessToken: newAccessToken() } : {}) },
    include: { requests: { where: { status: { in: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } }, select: { id: true } } },
  });
  return ok(toProviderAdminView(updated, new Date()));
});
