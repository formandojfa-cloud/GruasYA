import { getProvider } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { setProviderStatus } from "@/lib/dispatch";
import { getProviderSelf } from "@/lib/selfviews";
import { ProviderStatusSchema } from "@/lib/types";

export const POST = handle(async (req) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { status } = await parseBody(req, ProviderStatusSchema);
  const updated = await setProviderStatus(provider.id, status);
  return ok(await getProviderSelf(updated));
});
