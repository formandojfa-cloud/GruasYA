import { getOperator } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { buildOverview } from "@/lib/pbx";

/** Todo lo que necesita el panel: alertas, servicios activos, proveedores y métricas. */
export const GET = handle(async () => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  return ok(await buildOverview(operator));
});
