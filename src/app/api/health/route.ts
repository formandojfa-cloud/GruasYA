import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api-helpers";

export const GET = handle(async () => {
  const providers = await prisma.provider.count();
  return ok({ ok: true, providers, time: new Date().toISOString() });
});
