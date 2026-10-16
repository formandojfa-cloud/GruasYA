import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/auth";
import { handle, ok, unauthorized } from "@/lib/api-helpers";
import { parseQuote, REQUEST_INCLUDE } from "@/lib/dispatch";
import { toRequestView } from "@/lib/views";

/** Servicios terminados del proveedor con lo que ganó en cada uno. */
export const GET = handle(async () => {
  const provider = await getProvider();
  if (!provider) return unauthorized();
  const rows = await prisma.serviceRequest.findMany({
    where: { providerId: provider.id, status: { in: ["COMPLETED", "CANCELLED"] } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: REQUEST_INCLUDE,
  });
  const jobs = await Promise.all(
    rows.map(async (r) => ({ ...(await toRequestView(r, "PROVIDER")), payoutQ: r.status === "COMPLETED" ? parseQuote(r).providerPayoutQ : 0 })),
  );
  const totalQ = jobs.reduce((s, j) => s + j.payoutQ, 0);
  return ok({ jobs, totalQ });
});
