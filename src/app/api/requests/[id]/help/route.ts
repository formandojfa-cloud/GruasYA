import { getClientUser } from "@/lib/auth";
import { fail, handle, ok, unauthorized } from "@/lib/api-helpers";
import { loadRequest, requestOperatorHelp } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

/** "Hablar con un operador": escala al PBX sin esperar a que falle la cascada. */
export const POST = handle<Ctx>(async (_req, ctx) => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const existing = await loadRequest(id);
  if (!existing || existing.userId !== user.id) return fail("NOT_FOUND", "Solicitud no encontrada", 404);
  const updated = await requestOperatorHelp(id);
  return ok(await toRequestView(updated, "CLIENT"));
});
