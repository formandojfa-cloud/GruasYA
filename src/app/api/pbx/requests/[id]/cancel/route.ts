import { getOperator } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { cancelRequest } from "@/lib/dispatch";
import { CancelSchema } from "@/lib/types";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (req, ctx) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, CancelSchema);
  const updated = await cancelRequest(id, "PBX", reason, new Date(), { operatorId: operator.id });
  return ok(toRequestView(updated, "PBX"));
});
