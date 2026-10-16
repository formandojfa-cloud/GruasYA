import { prisma } from "@/lib/db";
import { clearSession, setSession } from "@/lib/auth";
import { SESSION } from "@/lib/config";
import { handle, ok, parseBody } from "@/lib/api-helpers";
import { getClientSelf } from "@/lib/selfviews";
import { ClientLoginSchema } from "@/lib/types";

/**
 * Alta/ingreso de cliente por teléfono. MVP sin verificación por SMS: ver
 * docs/ARCHITECTURE.md → Seguridad antes de salir a producción.
 */
export const POST = handle(async (req) => {
  const { phone, name } = await parseBody(req, ClientLoginSchema);
  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, name },
    update: { name },
  });
  await setSession(SESSION.cookieClient, user.id);
  return ok(await getClientSelf(user));
});

export const DELETE = handle(async () => {
  await clearSession(SESSION.cookieClient);
  return ok({ ok: true });
});
