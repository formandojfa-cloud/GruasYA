import { getProvider } from "@/lib/auth";
import { fail, handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { loadRequest, rateRequest } from "@/lib/dispatch";
import { RateSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, ctx) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { id } = await ctx.params;
  const existing = await loadRequest(id);
  if (!existing || existing.providerId !== provider.id) return fail("NOT_FOUND", "Servicio no encontrado", 404);
  const { stars, comment } = await parseBody(req, RateSchema);
  await rateRequest(id, "PROVIDER", stars, comment);
  return ok({ ok: true });
});
