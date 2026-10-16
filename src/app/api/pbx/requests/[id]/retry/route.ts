import { getOperator } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { retrySearch } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

/** Vuelve a lanzar la búsqueda automática de una solicitud escalada. */
export const POST = handle<Ctx>(async (_req, ctx) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const { id } = await ctx.params;
  const updated = await retrySearch(id, operator.id);
  return ok(await toRequestView(updated, "PBX"));
});
