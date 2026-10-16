import { getProvider } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { providerTransition } from "@/lib/dispatch";
import { ProviderTransitionSchema } from "@/lib/types";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

/** EN_ROUTE → ARRIVED → (PIN) IN_PROGRESS → COMPLETED */
export const POST = handle<Ctx>(async (req, ctx) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { id } = await ctx.params;
  const { to, pin } = await parseBody(req, ProviderTransitionSchema);
  const updated = await providerTransition(id, provider.id, to, pin);
  return ok(await toRequestView(updated, "PROVIDER"));
});
