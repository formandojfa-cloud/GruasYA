import { getProvider } from "@/lib/auth";
import { fail, handle, ok, unauthorized } from "@/lib/api-helpers";
import { loadRequest } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { id } = await ctx.params;
  const req = await loadRequest(id);
  if (!req || req.providerId !== provider.id) return fail("NOT_FOUND", "Servicio no encontrado", 404);
  return ok(toRequestView(req, "PROVIDER"));
});
