import { getProvider } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { providerBailout } from "@/lib/dispatch";
import { CancelSchema } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** El proveedor se baja del servicio; la solicitud vuelve a buscarse o se escala. */
export const POST = handle<Ctx>(async (req, ctx) => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, CancelSchema);
  const updated = await providerBailout(id, provider.id, reason);
  return ok({ ok: true, requestStatus: updated.status });
});
