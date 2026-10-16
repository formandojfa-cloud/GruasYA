import { getProvider } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { acceptOffer } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, ctx) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { id } = await ctx.params;
  const req = await acceptOffer(id, provider.id);
  return ok(toRequestView(req, "PROVIDER"));
});
