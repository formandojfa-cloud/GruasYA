import { getProvider } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { getProviderSelf } from "@/lib/selfviews";

/** Estado del proveedor: oferta pendiente, servicio activo y ganancias del día. */
export const GET = handle(async () => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  return ok(await getProviderSelf(provider));
});
