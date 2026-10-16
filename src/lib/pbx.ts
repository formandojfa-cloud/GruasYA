import type { Operator } from "@/generated/prisma/client";
import { DISPATCH } from "./config";
import { prisma } from "./db";
import { ACTIVE, advanceRequest, REQUEST_INCLUDE } from "./dispatch";
import type { AlertView, PbxOverview } from "./types";
import { toProviderAdminView, toRequestView } from "./views";

export async function buildOverview(operator: Operator, now: Date = new Date()): Promise<PbxOverview> {
  // Avanzar primero para que el panel vea el estado real de las cascadas.
  const searching = await prisma.serviceRequest.findMany({ where: { status: "SEARCHING" }, select: { id: true } });
  await Promise.all(searching.map((r) => advanceRequest(r.id, now).catch(() => null)));

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [alerts, active, recentCompleted, providers, completedToday, last7d] = await Promise.all([
    prisma.escalationAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "asc" },
      include: { acknowledgedBy: true, request: { include: REQUEST_INCLUDE } },
    }),
    prisma.serviceRequest.findMany({
      where: { status: { in: [...ACTIVE] } },
      orderBy: { createdAt: "asc" },
      include: REQUEST_INCLUDE,
    }),
    prisma.serviceRequest.findMany({
      where: { status: { in: ["COMPLETED", "CANCELLED"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: REQUEST_INCLUDE,
    }),
    prisma.provider.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: { requests: { where: { status: { in: ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } }, select: { id: true } } },
    }),
    prisma.serviceRequest.count({ where: { status: "COMPLETED", completedAt: { gte: dayStart } } }),
    prisma.serviceRequest.findMany({
      where: { createdAt: { gte: weekAgo }, status: { in: ["COMPLETED", "CANCELLED", "ESCALATED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } },
      select: { escalatedAt: true },
    }),
  ]);

  const [alertRequests, activeViews, completedViews] = await Promise.all([
    Promise.all(alerts.map((a) => toRequestView(a.request, "PBX", now))),
    Promise.all(active.map((r) => toRequestView(r, "PBX", now))),
    Promise.all(recentCompleted.map((r) => toRequestView(r, "PBX", now))),
  ]);
  const alertViews: AlertView[] = alerts.map((a, i) => ({
    id: a.id,
    requestId: a.requestId,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: a.acknowledgedBy?.name ?? null,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    request: alertRequests[i],
  }));

  const staleCutoff = now.getTime() - DISPATCH.providerStaleMs;
  const online = providers.filter((p) => p.status === "ONLINE" && p.lastSeenAt && p.lastSeenAt.getTime() >= staleCutoff).length;

  return {
    operator: { id: operator.id, name: operator.name },
    alerts: alertViews,
    active: activeViews,
    recentCompleted: completedViews,
    providers: providers.map((p) => toProviderAdminView(p, now)),
    stats: {
      online,
      busy: providers.filter((p) => p.status === "BUSY").length,
      searching: active.filter((r) => r.status === "SEARCHING").length,
      escalated: active.filter((r) => r.status === "ESCALATED").length,
      inService: active.filter((r) => ["EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(r.status)).length,
      completedToday,
      escalationRate7d: last7d.length ? Math.round((last7d.filter((r) => r.escalatedAt).length / last7d.length) * 100) / 100 : null,
    },
    serverTime: now.toISOString(),
  };
}
