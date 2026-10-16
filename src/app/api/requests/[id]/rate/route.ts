import { getClientUser } from "@/lib/auth";
import { fail, handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { loadRequest, rateRequest } from "@/lib/dispatch";
import { RateSchema } from "@/lib/types";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, ctx) => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const existing = await loadRequest(id);
  if (!existing || existing.userId !== user.id) return fail("NOT_FOUND", "Solicitud no encontrada", 404);
  const { stars, comment } = await parseBody(req, RateSchema);
  await rateRequest(id, "CLIENT", stars, comment);
  const fresh = await loadRequest(id);
  return ok(toRequestView(fresh!, "CLIENT"));
});
