import { prisma } from "@/lib/db";
import { getClientUser } from "@/lib/auth";
import { handle, ok, parseBody, unauthorized } from "@/lib/api-helpers";
import { createRequest, REQUEST_INCLUDE } from "@/lib/dispatch";
import { CreateRequestSchema } from "@/lib/types";
import { toRequestView } from "@/lib/views";

/** Crear solicitud: arranca la cascada de inmediato (o escala si no hay nadie). */
export const POST = handle(async (req) => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  const input = await parseBody(req, CreateRequestSchema);
  const created = await createRequest(user, input);
  return ok(await toRequestView(created, "CLIENT"), 201);
});

/** Historial del cliente (más recientes primero). */
export const GET = handle(async () => {
  const user = await getClientUser();
  if (!user) return unauthorized();
  const rows = await prisma.serviceRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: REQUEST_INCLUDE,
  });
  return ok({ requests: await Promise.all(rows.map((r) => toRequestView(r, "CLIENT"))) });
});
