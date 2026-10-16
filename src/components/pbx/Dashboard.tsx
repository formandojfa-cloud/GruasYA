"use client";

/**
 * Tablero "Servicios" de la Central: tarjeta de métricas, columna de alertas,
 * mapa de la red (en una tarjeta de 300 px en teléfono) y lista de servicios
 * activos/recientes como tarjetas de estado con borde de color. Todo sale de
 * un solo `PbxOverview`.
 */
import { useMemo, useState } from "react";
import MapView, { type MapMarker, type MapMarkerKind } from "@/components/map/Map";
import { Button, cn, EmptyState, Pill, statusClass, StatusPill } from "@/components/ui";
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
  statusLabelFor,
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

/** En escritorio la rejilla ocupa lo que queda bajo la barra y las métricas; en teléfono fluye. */
const GRID_H = "lg:h-[calc(100dvh-236px)] lg:min-h-[480px]";

export default function Dashboard({ overview, unseen, onOpen, onAck }: Props) {
  const now = useNow(1000);
  return (
    <>
      <StatsCard stats={overview.stats} />
      <div className={cn("grid gap-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)_400px]", GRID_H)}>
        <AlertsColumn alerts={overview.alerts} unseen={unseen} now={now} onOpen={onOpen} onAck={onAck} />
        <PbxMap providers={overview.providers} active={overview.active} />
        <div className="flex flex-col gap-3 min-w-0 lg:min-h-0 lg:overflow-y-auto">
          <ActiveList active={overview.active} now={now} onOpen={onOpen} />
          <RecentList recent={overview.recentCompleted} onOpen={onOpen} />
        </div>
      </div>
    </>
  );
}

// ---------- Métricas (tarjeta "Servicios" del prototipo) ----------

function StatsCard({ stats }: { stats: PbxOverview["stats"] }) {
  const rate = stats.escalationRate7d;
  return (
    <section className="tarjeta gap-0 lg:flex-row lg:items-stretch lg:py-3" aria-label="Resumen">
      <Stat label="Servicios completados hoy" value={stats.completedToday} />
      <Stat label="Sin grúa (pasaron a la central)" value={stats.escalated} tone={stats.escalated > 0 ? "danger" : "neutral"} />
      <Stat label="Grúas disponibles" value={stats.online} tone={stats.online === 0 ? "danger" : "success"} />
      <Stat label="En servicio" value={stats.busy} tone="info" hint={`${stats.inService} servicio${stats.inService === 1 ? "" : "s"} activo${stats.inService === 1 ? "" : "s"}`} />
      <Stat label="Buscando grúa" value={stats.searching} tone={stats.searching > 0 ? "warning" : "neutral"} />
      <Stat label="Sin grúa en 7 días" value={rate == null ? "—" : `${Math.round(rate * 100)} %`} tone={rate != null && rate > 0.3 ? "danger" : "neutral"} />
    </section>
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
    <section className="flex flex-col gap-2 min-w-0 lg:min-h-0" aria-label="Alertas">
      <SectionTitle
        right={
          <span className="tenue chico">
            {alerts.length} abierta{alerts.length === 1 ? "" : "s"}
            {pending > 0 && <span className="ml-1 font-bold text-rojo">· {pending} sin atender</span>}
          </span>
        }
      >
        Alertas
      </SectionTitle>
      <div className="flex flex-col gap-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1">
        {alerts.length === 0 ? (
          <div className="tarjeta tenue">Sin alertas abiertas. La cascada automática está resolviendo todo.</div>
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
    <article className={cn("tarjeta estado", acked ? "estado-buscando" : "estado-sin_grua", isNew && "ring-2 ring-rojo/50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isNew && <Pill tone="danger">NUEVA</Pill>}
          {!acked && !isNew && <Pill tone="danger">Sin atender</Pill>}
          <StatusPill status={r.status} />
          {!escalated && !finished && <Pill tone="info">servicio en curso</Pill>}
        </div>
        <time className="tenue chico whitespace-nowrap tabular-nums" dateTime={alert.createdAt} title={formatTime(alert.createdAt)}>
          {relativeTime(alert.createdAt, now)}
        </time>
      </div>
      <h3 className={cn("text-[17px] font-semibold leading-snug", !acked && "text-rojo")}>{escalationReasonLabel(alert.reason)}</h3>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="truncate">{r.client?.name ?? "Conductor"}</strong>
          <span className="tenue chico whitespace-nowrap">
            {KIND_ICONS[r.kind]} {KIND_LABELS[r.kind]} · <span className="font-semibold text-foreground">{formatQ(r.priceTotal)}</span>
          </span>
        </div>
        <p className="tenue break-words">📍 {placeLabel(r.pickup)}</p>
        {r.provider && (
          <p className="tenue break-words">
            {providerNoun(r)}: {glyphFor(r.provider.kind)} {r.provider.name}
          </p>
        )}
      </div>

      {r.client && <ContactLinks phone={r.client.phone} whatsapp={r.client.whatsapp} />}

      <div className="flex items-center gap-2">
        {acked ? (
          <span className="tenue chico flex-1 min-w-0 truncate">
            ✓ Atiende {alert.acknowledgedBy ?? "la central"} · {relativeTime(alert.acknowledgedAt!, now)}
          </span>
        ) : (
          <Button size="sm" className="flex-1" loading={busy} onClick={onAck}>
            Atender
          </Button>
        )}
        <Button size="sm" variant={acked ? "primary" : "secondary"} className="flex-1" onClick={onOpen}>
          Abrir
        </Button>
      </div>
      {error && <p className="chico text-rojo">{error}</p>}
    </article>
  );
}

/** "Grúa" para remolques, "Motorista" para asistencias ligeras (como en el prototipo: "Grúa: …"). */
function providerNoun(r: RequestView): string {
  return r.kind === "TOW" ? "Grúa" : "Motorista";
}

/** Título de la tarjeta de estado visto desde la Central (el texto de "sin grúa" del conductor dice "te llama"). */
function centralStatusLabel(r: RequestView): string {
  return r.status === "ESCALATED" ? "Sin grúa · pasó a la central" : statusLabelFor(r.status, r.kind);
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
      const suffix = p.status === "OFFLINE" ? " · no disponible" : p.isStale ? " · sin señal" : "";
      out.push({ id: `p-${p.id}`, lat: p.location.lat, lng: p.location.lng, kind, label: `${p.name}${suffix}`, heading: p.location.heading, glyph: glyphFor(p.kind) });
    }
    for (const r of active) {
      out.push({ id: `r-${r.id}`, lat: r.pickup.lat, lng: r.pickup.lng, kind: "pickup", label: `${r.client?.name ?? "Conductor"} · ${STATUS_SHORT[r.status]}` });
    }
    return out;
  }, [providers, active, showOffline]);
  const located = providers.filter((p) => p.location && p.status !== "OFFLINE").length;
  const chip = "rounded-full bg-background/90 backdrop-blur px-2 py-1 border border-border text-[11px] text-foreground";

  return (
    <section className="mapa-marco min-w-0 lg:h-full" aria-label="Mapa de la red">
      <MapView className="h-full w-full" markers={markers} fitToMarkers={autoFit} zoom={12} />
      <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1">
        <span className={chip}>
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-verde mr-1 align-middle" />
          Disponible
        </span>
        <span className={chip}>
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-azul mr-1 align-middle" />
          En servicio
        </span>
        <span className={chip}>🚗 Vehículo</span>
      </div>
      <div className="absolute bottom-2 left-2 z-10 flex flex-wrap gap-1">
        <label className={cn(chip, "inline-flex items-center gap-1 cursor-pointer select-none")}>
          <input type="checkbox" checked={showOffline} onChange={(e) => setShowOffline(e.target.checked)} />
          Ver no disponibles
        </label>
        <label className={cn(chip, "inline-flex items-center gap-1 cursor-pointer select-none")}>
          <input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} />
          Auto-encuadre
        </label>
      </div>
      {markers.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="rounded-[10px] bg-background/90 px-3 py-2 text-sm text-muted border border-border">
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
    <section aria-label="Servicios activos" className="flex flex-col gap-2">
      <SectionTitle right={<span className="tenue chico">{active.length}</span>}>Activos</SectionTitle>
      {sorted.length === 0 ? (
        <div className="tarjeta tenue">No hay servicios en curso.</div>
      ) : (
        <ul className="flex flex-col gap-3">
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

/** Tarjeta de estado como en "Servicios" del prototipo: estado y precio, luego "{hora} · {conductor} → {destino} · {km}" y "Grúa: …". */
function ActiveRow({ r, now, onOpen }: { r: RequestView; now: number; onOpen: () => void }) {
  const offer = r.search.currentOffer;
  const live = r.providerLive;
  return (
    <button type="button" onClick={onOpen} className={cn("tarjeta w-full text-left gap-1 hover:bg-surface transition", statusClass(r.status))}>
      <div className="flex items-center justify-between gap-2">
        <strong className="truncate">{centralStatusLabel(r)}</strong>
        <span className="font-semibold tabular-nums whitespace-nowrap">{formatQ(r.priceTotal)}</span>
      </div>
      <div className="tenue break-words">
        {formatTime(r.timestamps.createdAt)} · {r.client?.name ?? "Conductor"}
        {r.client && <span className="chico"> ({formatPhone(r.client.phone)})</span>} → {r.dropoff ? placeLabel(r.dropoff) : `${KIND_ICONS[r.kind]} ${KIND_LABELS[r.kind]}`}
        {r.kind === "TOW" && ` · ${formatKm(r.distanceKm)}`}
      </div>
      <div className="tenue break-words">
        {providerNoun(r)}:{" "}
        {r.provider ? (
          <span className="text-foreground">
            {glyphFor(r.provider.kind)} {r.provider.name}
            {r.provider.isExternal && <span className="text-muted"> · externo</span>}
          </span>
        ) : (
          "—"
        )}{" "}
        · #{shortId(r.id)} · {relativeTime(r.timestamps.createdAt, now)}
      </div>
      <div className="tenue chico break-words">
        {r.status === "SEARCHING" &&
          (offer ? (
            <span>
              Oferta {offer.round} → <span className="text-foreground font-semibold">{offer.providerName}</span>, expira en{" "}
              <span className={cn("font-semibold tabular-nums", secondsUntil(offer.expiresAt, now) <= 10 ? "text-rojo" : "text-foreground")}>{secondsUntil(offer.expiresAt, now)} s</span>
              <span className="ml-1">
                · ofertas {r.search.offersSent}/{r.search.maxOffers}
              </span>
            </span>
          ) : (
            <span>
              Buscando candidato… · ofertas {r.search.offersSent}/{r.search.maxOffers}
            </span>
          ))}
        {r.status === "ESCALATED" && (
          <span className="text-rojo font-semibold">
            {r.escalation ? escalationReasonLabel(r.escalation.reason) : "Pasó a la central"}
            {r.escalation?.acknowledgedBy && <span className="text-muted font-normal"> · atiende {r.escalation.acknowledgedBy}</span>}
          </span>
        )}
        {(r.status === "EN_ROUTE" || r.status === "ARRIVED" || r.status === "IN_PROGRESS") &&
          (live ? (
            <span>
              {live.target === "PICKUP" ? "Llega al vehículo en" : "Llega al destino en"} <span className="text-foreground font-semibold">{formatMinutes(live.etaMinutes)}</span> · {formatKm(live.distanceKm)} ·
              señal {relativeTime(live.updatedAt, now)}
            </span>
          ) : (
            <span className="text-rojo">Sin ubicación del piloto</span>
          ))}
      </div>
    </button>
  );
}

// ---------- Recientes ----------

function RecentList({ recent, onOpen }: { recent: RequestView[]; onOpen: Props["onOpen"] }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Servicios recientes" className="tarjeta p-0 gap-0 overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 px-3.5 h-12 text-left" aria-expanded={open}>
        <h3 className="text-[17px] font-semibold">Recientes ({recent.length})</h3>
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
                  <button type="button" onClick={() => onOpen(r.id)} className="w-full text-left px-3.5 py-2.5 hover:bg-surface flex items-center gap-2">
                    <StatusPill status={r.status} />
                    <span className="flex-1 min-w-0 text-sm truncate">
                      {KIND_ICONS[r.kind]} {r.client?.name ?? "Conductor"}
                      <span className="text-muted"> · {r.provider ? r.provider.name : "sin piloto"}</span>
                    </span>
                    <span className="tenue chico whitespace-nowrap tabular-nums">
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
