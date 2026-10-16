import { getOperator } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { acknowledgeAlert } from "@/lib/dispatch";

type Ctx = { params: Promise<{ id: string }> };

/** El operador marca que ya está atendiendo la alerta. */
export const POST = handle<Ctx>(async (_req, ctx) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const { id } = await ctx.params;
  await acknowledgeAlert(id, operator.id);
  return ok({ ok: true });
});
