import { fail, handle, ok } from "@/lib/api-helpers";
import { advanceRequest } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Seguimiento público por enlace (como "compartir viaje"). El id es un cuid
 * imposible de adivinar; no expone PIN ni teléfonos.
 */
export const GET = handle<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const req = await advanceRequest(id);
  if (!req) return fail("NOT_FOUND", "Solicitud no encontrada", 404);
  return ok(await toRequestView(req, "SHARE"));
});
