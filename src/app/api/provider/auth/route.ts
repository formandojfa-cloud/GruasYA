import { prisma } from "@/lib/db";
import { clearSession, setSession } from "@/lib/auth";
import { SESSION } from "@/lib/config";
import { fail, handle, ok, parseBody } from "@/lib/api-helpers";
import { getProviderSelf } from "@/lib/selfviews";
import { ProviderLoginSchema } from "@/lib/types";

/** Ingreso del proveedor con el token de su enlace mágico (/driver?token=…). */
export const POST = handle(async (req) => {
  const { token } = await parseBody(req, ProviderLoginSchema);
  const provider = await prisma.provider.findUnique({ where: { accessToken: token } });
  if (!provider) return fail("INVALID_TOKEN", "Enlace inválido. Pide uno nuevo a la central.", 401);
  await setSession(SESSION.cookieProvider, provider.id);
  return ok(await getProviderSelf(provider));
});

export const DELETE = handle(async () => {
  await clearSession(SESSION.cookieProvider);
  return ok({ ok: true });
});
