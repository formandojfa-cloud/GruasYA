"use client";

/**
 * Panel principal del operador: métricas, columna de alertas, mapa de la red y
 * lista de servicios activos/recientes. Todo sale de un solo `PbxOverview`.
 */
import { useMemo, useState } from "react";
import MapView, { type MapMarker, type MapMarkerKind } from "@/components/map/Map";
import { Button, cn, EmptyState, Pill, StatusPill } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import {
  escalationReasonLabel,
  formatKm,
  formatMinutes,
  formatPhone,
  formatQ,
  formatTime,
  KIND_ICONS,
  KIND_LABELS,
  relativeTime,
  secondsUntil,
  STATUS_SHORT,
} from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { AlertView, PbxOverview, ProviderAdminView, RequestView } from "@/lib/types";
import { ContactLinks, LinkButton, SectionTitle, Stat } from "./bits";
import { glyphFor, mapsLink, placeLabel, shortId } from "./util";

type Props = {
  overview: PbxOverview;
  unseen: ReadonlySet<string>;
  onOpen: (requestId: string, alertId?: string) => void;
  onAck: (alertId: string) => Promise<void>;
};

export default function Dashboard({ overview, unseen, onOpen, onAck }: Props) {
  const now = useNow(1000);
  return (
    <div className="flex flex-col gap-3 p-3 lg:p-4 lg:h-[calc(100dvh-57px)] lg:min-h-0">
      <StatsRow stats={overview.stats} />
      <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)_400px] lg:flex-1 lg:min-h-0">
        <AlertsColumn alerts={overview.alerts} unseen={unseen} now={now} onOpen={onOpen} onAck={onAck} />
        <PbxMap providers={overview.providers} active={overview.active} />
        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          <ActiveList active={overview.active} now={now} onOpen={onOpen} />
          <RecentList recent={overview.recentCompleted} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}

// ---------- Métricas ----------

function StatsRow({ stats }: { stats: PbxOverview["stats"] }) {
  const rate = stats.escalationRate7d;
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      <Stat
        label={
          <>
            <span className="sm:hidden">Disponibles</span>
            <span className="hidden sm:inline">Grúas disponibles</span>
          </>
        }
        value={stats.online}
        tone={stats.online === 0 ? "danger" : "success"}
      />
      <Stat label="En servicio" value={stats.busy} tone="info" hint={`${stats.inService} servicio${stats.inService === 1 ? "" : "s"} activo${stats.inService === 1 ? "" : "s"}`} />
      <Stat label="Buscando" value={stats.searching} tone={stats.searching > 0 ? "info" : "neutral"} />
      <Stat label="Escaladas" value={stats.escalated} tone={stats.escalated > 0 ? "danger" : "neutral"} />
      <Stat label="Servicios hoy" value={stats.completedToday} />
      <Stat label="% escalado 7 d" value={rate == null ? "—" : `${Math.round(rate * 100)} %`} tone={rate != null && rate > 0.3 ? "warning" : "neutral"} />
    </div>
  );
}

// ---------- Alertas ----------

function AlertsColumn({
  alerts,
  unseen,
  now,
  onOpen,
  onAck,
}: {
  alerts: AlertView[];
  unseen: ReadonlySet<string>;
  now: number;
  onOpen: Props["onOpen"];
  onAck: Props["onAck"];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = alerts.filter((a) => !a.acknowledgedAt).length;

  async function ack(id: string) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      await onAck(id);
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: errorMessage(err) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col lg:min-h-0" aria-label="Alertas">
      <SectionTitle
        right={
          <span className="text-xs text-muted">
            {alerts.length} abierta{alerts.length === 1 ? "" : "s"}
            {pending > 0 && <span className="ml-1 font-bold text-danger">· {pending} sin atender</span>}
          </span>
        }
      >
        Alertas
      </SectionTitle>
      <div className="flex flex-col gap-2 lg:overflow-y-auto lg:min-h-0 lg:pr-1">
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Sin alertas abiertas. La cascada automática está resolviendo todo.</div>
        ) : (
          alerts.map((a) => (
            <AlertCard key={a.id} alert={a} isNew={unseen.has(a.id)} now={now} busy={busy === a.id} error={errors[a.id]} onOpen={() => onOpen(a.requestId, a.id)} onAck={() => ack(a.id)} />
          ))
        )}
      </div>
    </section>
  );
}

function AlertCard({
  alert,
  isNew,
  now,
  busy,
  error,
  onOpen,
  onAck,
}: {
  alert: AlertView;
  isNew: boolean;
  now: number;
  busy: boolean;
  error?: string;
  onOpen: () => void;
  onAck: () => void;
}) {
  const r = alert.request;
  const acked = !!alert.acknowledgedAt;
  const escalated = r.status === "ESCALATED";
  const finished = r.status === "COMPLETED" || r.status === "CANCELLED";
  return (
    <article
      className={cn(
        "rounded-xl border bg-background p-3 border-l-4 flex flex-col gap-2",
        acked ? "border-border border-l-warning" : "border-danger/40 border-l-danger",
        isNew && "ring-2 ring-danger/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {isNew && <Pill tone="danger">NUEVA</Pill>}
            {!acked && !isNew && <Pill tone="danger">Sin atender</Pill>}
            <StatusPill status={r.status} />
            {!escalated && !finished && <Pill tone="info">servicio en curso</Pill>}
          </div>
          <p className={cn("mt-1 text-sm font-bold leading-snug", !acked && "text-danger")}>{escalationReasonLabel(alert.reason)}</p>
        </div>
        <time className="text-xs text-muted whitespace-nowrap tabular-nums" dateTime={alert.createdAt} title={formatTime(alert.createdAt)}>
          {relativeTime(alert.createdAt, now)}
        </time>
      </div>

      <div className="text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold truncate">{r.client?.name ?? "Cliente"}</span>
          <span className="text-xs text-muted whitespace-nowrap">
            {KIND_ICONS[r.kind]} {KIND_LABELS[r.kind]} · <span className="font-semibold text-foreground">{formatQ(r.priceTotal)}</span>
          </span>
        </div>
        <p className="text-xs text-muted truncate" title={placeLabel(r.pickup)}>
          📍 {placeLabel(r.pickup)}
        </p>
        {r.provider && (
          <p className="text-xs text-muted truncate">
            {glyphFor(r.provider.kind)} {r.provider.name}
          </p>
        )}
      </div>

      {r.client && <ContactLinks phone={r.client.phone} whatsapp={r.client.whatsapp} />}

      <div className="flex items-center gap-2 pt-1">
        {acked ? (
          <span className="text-xs text-muted flex-1 min-w-0 truncate">
            ✓ Atiende {alert.acknowledgedBy ?? "operador"} · {relativeTime(alert.acknowledgedAt!, now)}
          </span>
        ) : (
          <Button size="sm" variant="danger" className="flex-1" loading={busy} onClick={onAck}>
            Atender
          </Button>
        )}
        <Button size="sm" variant={acked ? "primary" : "secondary"} className="flex-1" onClick={onOpen}>
          Abrir
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </article>
  );
}

// ---------- Mapa ----------

function PbxMap({ providers, active }: { providers: ProviderAdminView[]; active: RequestView[] }) {
  const [showOffline, setShowOffline] = useState(false);
  const [autoFit, setAutoFit] = useState(true);
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const p of providers) {
      if (!p.location) continue;
      if (p.status === "OFFLINE" && !showOffline) continue;
      const kind: MapMarkerKind = p.status === "ONLINE" ? "provider-idle" : "provider-busy";
      const suffix = p.status === "OFFLINE" ? " · desconectado" : p.isStale ? " · sin señal" : "";
      out.push({ id: `p-${p.id}`, lat: p.location.lat, lng: p.location.lng, kind, label: `${p.name}${suffix}`, heading: p.location.heading, glyph: glyphFor(p.kind) });
    }
    for (const r of active) {
      out.push({ id: `r-${r.id}`, lat: r.pickup.lat, lng: r.pickup.lng, kind: "pickup", label: `${r.client?.name ?? "Cliente"} · ${STATUS_SHORT[r.status]}` });
    }
    return out;
  }, [providers, active, showOffline]);
  const located = providers.filter((p) => p.location && p.status !== "OFFLINE").length;

  return (
    <section className="relative h-72 lg:h-auto lg:min-h-0 rounded-2xl overflow-hidden border border-border bg-surface" aria-label="Mapa de la red">
      <MapView className="h-full w-full" markers={markers} fitToMarkers={autoFit} zoom={12} />
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1 text-[11px]">
        <span className="rounded-full bg-background/90 backdrop-blur px-2 py-1 border border-border">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-success mr-1 align-middle" />
          Disponible
        </span>
        <span className="rounded-full bg-background/90 backdrop-blur px-2 py-1 border border-border">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted mr-1 align-middle" />
          En servicio
        </span>
        <span className="rounded-full bg-background/90 backdrop-blur px-2 py-1 border border-border">📍 Recogida</span>
      </div>
      <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1 text-[11px]">
        <label className="rounded-full bg-background/90 backdrop-blur px-2 py-1 border border-border inline-flex items-center gap-1 cursor-pointer select-none">
          <input type="checkbox" checked={showOffline} onChange={(e) => setShowOffline(e.target.checked)} />
          Ver desconectados
        </label>
        <label className="rounded-full bg-background/90 backdrop-blur px-2 py-1 border border-border inline-flex items-center gap-1 cursor-pointer select-none">
          <input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} />
          Auto-encuadre
        </label>
      </div>
      {markers.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="rounded-xl bg-background/90 px-3 py-2 text-sm text-muted border border-border">
            {located === 0 ? "Ninguna grúa conectada con ubicación" : "Sin marcadores"}
          </span>
        </div>
      )}
    </section>
  );
}

// ---------- Activos ----------

function ActiveList({ active, now, onOpen }: { active: RequestView[]; now: number; onOpen: Props["onOpen"] }) {
  const sorted = useMemo(() => {
    const rank: Record<string, number> = { ESCALATED: 0, SEARCHING: 1, EN_ROUTE: 2, ARRIVED: 3, IN_PROGRESS: 4 };
    return [...active].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.timestamps.createdAt.localeCompare(b.timestamps.createdAt));
  }, [active]);
  return (
    <section aria-label="Servicios activos">
      <SectionTitle right={<span className="text-xs text-muted">{active.length}</span>}>Activos</SectionTitle>
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No hay servicios en curso.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((r) => (
            <li key={r.id}>
              <ActiveRow r={r} now={now} onOpen={() => onOpen(r.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActiveRow({ r, now, onOpen }: { r: RequestView; now: number; onOpen: () => void }) {
  const offer = r.search.currentOffer;
  const live = r.providerLive;
  const escalatedTone = r.status === "ESCALATED";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full text-left rounded-xl border bg-background p-3 hover:bg-surface transition flex flex-col gap-1",
        escalatedTone ? "border-warning/70" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <StatusPill status={r.status} />
          <span className="text-xs text-muted truncate">
            {KIND_ICONS[r.kind]} {KIND_LABELS[r.kind]} · #{shortId(r.id)}
          </span>
        </div>
        <span className="text-xs text-muted whitespace-nowrap tabular-nums">{relativeTime(r.timestamps.createdAt, now)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold truncate">
          {r.client?.name ?? "Cliente"}
          {r.client && <span className="font-normal text-muted"> · {formatPhone(r.client.phone)}</span>}
        </span>
        <span className="text-sm font-bold tabular-nums">{formatQ(r.priceTotal)}</span>
      </div>
      <div className="text-xs truncate">
        {r.provider ? (
          <span>
            {glyphFor(r.provider.kind)} {r.provider.name}
            {r.provider.isExternal && <span className="text-muted"> · externo</span>}
          </span>
        ) : (
          <span className="text-muted">— sin asignar</span>
        )}
      </div>
      <div className="text-xs text-muted truncate">
        {r.status === "SEARCHING" &&
          (offer ? (
            <span>
              Oferta {offer.round} → <span className="text-foreground font-semibold">{offer.providerName}</span>, expira en{" "}
              <span className={cn("font-semibold tabular-nums", secondsUntil(offer.expiresAt, now) <= 10 ? "text-danger" : "text-foreground")}>{secondsUntil(offer.expiresAt, now)} s</span>
              <span className="ml-1">· {r.search.offersSent}/{r.search.maxOffers}</span>
            </span>
          ) : (
            <span>
              Buscando candidato… · {r.search.offersSent}/{r.search.maxOffers}
            </span>
          ))}
        {r.status === "ESCALATED" && (
          <span className="text-warning font-semibold">
            {r.escalation ? escalationReasonLabel(r.escalation.reason) : "Escalado"}
            {r.escalation?.acknowledgedBy && <span className="text-muted font-normal"> · atiende {r.escalation.acknowledgedBy}</span>}
          </span>
        )}
        {(r.status === "EN_ROUTE" || r.status === "ARRIVED" || r.status === "IN_PROGRESS") &&
          (live ? (
            <span>
              {live.target === "PICKUP" ? "Llega al punto en" : "Llega al destino en"} <span className="text-foreground font-semibold">{formatMinutes(live.etaMinutes)}</span> · {formatKm(live.distanceKm)} · señal{" "}
              {relativeTime(live.updatedAt, now)}
            </span>
          ) : (
            <span className="text-warning">Sin ubicación del proveedor</span>
          ))}
      </div>
    </button>
  );
}

// ---------- Recientes ----------

function RecentList({ recent, onOpen }: { recent: RequestView[]; onOpen: Props["onOpen"] }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Servicios recientes" className="rounded-xl border border-border bg-background">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 px-3 h-11 text-left" aria-expanded={open}>
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Recientes ({recent.length})</span>
        <span className="text-muted text-sm">{open ? "▴" : "▾"}</span>
      </button>
      {open &&
        (recent.length === 0 ? (
          <EmptyState title="Sin servicios recientes" body="Aquí aparecen los últimos completados y cancelados." />
        ) : (
          <ul className="border-t border-border divide-y divide-border">
            {recent.map((r) => {
              const at = r.timestamps.completedAt ?? r.timestamps.cancelledAt ?? r.updatedAt;
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => onOpen(r.id)} className="w-full text-left px-3 py-2 hover:bg-surface flex items-center gap-2">
                    <StatusPill status={r.status} />
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {KIND_ICONS[r.kind]} {r.client?.name ?? "Cliente"}
                      <span className="text-muted"> · {r.provider ? r.provider.name : "sin proveedor"}</span>
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap tabular-nums">
                      {formatQ(r.priceTotal)} · {formatTime(at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}

/** Enlace a Google Maps para un punto (lo usa también el detalle). */
export function MapsLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <LinkButton href={mapsLink({ lat, lng })} size="sm" title="Abrir en Google Maps">
      🗺️ Mapa
    </LinkButton>
  );
}
