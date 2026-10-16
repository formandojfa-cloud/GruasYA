import { getProvider } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { rejectOffer } from "@/lib/dispatch";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, ctx) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { id } = await ctx.params;
  await rejectOffer(id, provider.id);
  return ok({ ok: true });
});
