import { getClientUser } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { getClientSelf } from "@/lib/selfviews";

export const GET = handle(async () => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  return ok(await getClientSelf(user));
});
