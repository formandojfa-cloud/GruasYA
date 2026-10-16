import { prisma } from "@/lib/db";
import { getOperator, newAccessToken } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { assignProvider } from "@/lib/dispatch";
import { providerAccessLink, providerInviteText, whatsappLink } from "@/lib/notifications";
import { PbxAssignSchema } from "@/lib/types";
import { toRequestView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Asignación manual desde el PBX: un proveedor existente o uno externo nuevo
 * (gruero coordinado por teléfono). Devuelve el enlace para mandarle por
 * WhatsApp y que comparta ubicación sin instalar nada.
 */
export const POST = handle<Ctx>(async (req, ctx) => {
  const operator = await getOperator();
  if (!operator) return unauthorized();
  const { id } = await ctx.params;
  const input = await parseBody(req, PbxAssignSchema);

  let providerId = input.providerId;
  let invite: { accessLink: string; whatsapp: string } | null = null;
  if (input.external) {
    const ext = input.external;
    const existing = await prisma.provider.findFirst({ where: { phone: ext.phone, kind: ext.kind } });
    const provider =
      existing ??
      (await prisma.provider.create({
        data: {
          name: ext.name,
          phone: ext.phone,
          kind: ext.kind,
          plate: ext.plate ?? null,
          vehicleLabel: ext.vehicleLabel ?? null,
          isExternal: true,
          accessToken: newAccessToken(),
        },
      }));
    providerId = provider.id;
    invite = {
      accessLink: providerAccessLink(provider.accessToken),
      whatsapp: whatsappLink(provider.phone, providerInviteText(provider.name, provider.accessToken)),
    };
  }

  const updated = await assignProvider(id, providerId!, operator.id);
  return ok({ request: toRequestView(updated, "PBX"), invite });
});
