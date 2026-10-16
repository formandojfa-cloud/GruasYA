import { getOperator } from "@/lib/auth";
import { fail, handle, ok, unauthorized } from "@/lib/api-helpers";
import { advanceRequest } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, ctx) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const { id } = await ctx.params;
  const req = await advanceRequest(id);
  if (!req) return fail("NOT_FOUND", "Solicitud no encontrada", 404);
  return ok(await toRequestView(req, "PBX"));
});
