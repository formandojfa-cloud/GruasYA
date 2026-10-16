import { getClientUser } from "@/lib/auth";
import { fail, handle, ok, unauthorized } from "@/lib/api-helpers";
import { advanceRequest } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Estado de la solicitud para el cliente. Cada lectura avanza la cascada si la
 * oferta pendiente expiró (avance perezoso), así el estado siempre está al día.
 */
export const GET = handle<Ctx>(async (_req, ctx) => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const req = await advanceRequest(id);
  if (!req || req.userId !== user.id) return fail("NOT_FOUND", "Solicitud no encontrada", 404);
  return ok(toRequestView(req, "CLIENT"));
});
