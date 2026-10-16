import { getClientUser } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { cancelRequest } from "@/lib/dispatch";
import { CancelSchema } from "@/lib/types";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, ctx) => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, CancelSchema);
  const updated = await cancelRequest(id, "CLIENT", reason, new Date(), { userId: user.id });
  return ok(await toRequestView(updated, "CLIENT"));
});
