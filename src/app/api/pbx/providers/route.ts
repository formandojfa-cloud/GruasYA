import { prisma } from "@/lib/db";
import { getOperator, newAccessToken } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { ExternalProviderSchema } from "@/lib/types";
import { toProviderAdminView } from "@/lib/views";

export const GET = handle(async () => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const now = new Date();
  const providers = await prisma.provider.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { requests: { where: { status: { in: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } }, select: { id: true } } },
  });
  return ok({ providers: providers.map((p) => toProviderAdminView(p, now)) });
});

/** Da de alta un proveedor (gruero o motorista) y genera su enlace de acceso. */
export const POST = handle(async (req) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const input = await parseBody(req, ExternalProviderSchema);
  const provider = await prisma.provider.create({
    data: {
      name: input.name,
      phone: input.phone,
      kind: input.kind,
      plate: input.plate ?? null,
      vehicleLabel: input.vehicleLabel ?? null,
      isExternal: true,
      accessToken: newAccessToken(),
    },
  });
  return ok(toProviderAdminView(provider, new Date()), 201);
});
