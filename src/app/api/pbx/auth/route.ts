import { prisma } from "@/lib/db";
import { clearSession, pbxPasswordMatches, setSession } from "@/lib/auth";
import { SESSION } from "@/lib/config";
import { fail, handle, ok, parseBody } from "@/lib/api-helpers";
import { OperatorLoginSchema } from "@/lib/types";

/** Ingreso de operador del PBX con la contraseña compartida (PBX_PASSWORD). */
export const POST = handle(async (req) => {
  const { password, name } = await parseBody(req, OperatorLoginSchema);
  if (!pbxPasswordMatches(password)) return fail("INVALID_PASSWORD", "Contraseña incorrecta", 401);
  const operatorName = name ?? "Operador";
  const operator =
    (await prisma.operator.findFirst({ where: { name: operatorName } })) ??
    (await prisma.operator.create({ data: { name: operatorName } }));
  await setSession(SESSION.cookieOperator, operator.id);
  return ok({ id: operator.id, name: operator.name });
});

export const DELETE = handle(async () => {
  await clearSession(SESSION.cookieOperator);
  return ok({ ok: true });
});
