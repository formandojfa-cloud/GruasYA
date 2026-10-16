"use client";

/**
 * Detalle de una solicitud para la Central: todo a la vista (conductor, lugar,
 * vehículo, precio fijo, PIN, piloto, línea de tiempo) y las acciones que
 * permite su estado. Vive en /pbx?request=<id> para poder enlazarlo.
 */
import { useCallback, useMemo, useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Button, cn, Input, Notice, Pill, Spinner, StatusCard, StatusPill } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import {
  escalationReasonLabel,
  EVENT_LABELS,
  formatDateTime,
  formatKm,
  formatMinutes,
  formatQ,
  formatTime,
  KIND_ICONS,
  KIND_LABELS,
  PROVIDER_KIND_LABELS,
  relativeTime,
  secondsUntil,
  statusLabelFor,
  VEHICLE_LABELS,
} from "@/lib/format";
import { useNow, usePolling } from "@/lib/hooks";
import type { AlertView, PbxOverview, RequestEventView, RequestView } from "@/lib/types";
import AssignPanel, { type AssignResult, describeError } from "./AssignPanel";
import { Box, ContactLinks, Drawer, ErrorText, KV, LinkButton, SectionTitle } from "./bits";
import InviteBox from "./InviteBox";
import {
  ASSIGNABLE_STATUSES,
  ASSIGNED_BY_LABELS,
  ASSIGNED_STATUSES,
  CANCELLABLE_STATUSES,
  CANCELLED_BY_LABELS,
  coordsLabel,
  glyphFor,
  isOfferEvent,
  mapsLink,
  num,
  OFFER_RESPONSE_LABELS,
  PBX_EVENT_OVERRIDES,
  placeLabel,
  providerNameFrom,
  shortId,
  str,
} from "./util";

type Props = {
  id: string;
  overview: PbxOverview | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onAck: (alertId: string) => Promise<void>;
};

type Invite = { forRequest: string; accessLink: string; whatsapp: string; name: string };

export default function RequestDetail({ id, overview, onClose, onChanged, onAck }: Props) {
  const fromOverview = useMemo<RequestView | null>(() => {
    if (!overview) return null;
    return (
      overview.active.find((r) => r.id === id) ??
      overview.alerts.find((a) => a.requestId === id)?.request ??
      overview.recentCompleted.find((r) => r.id === id) ??
      null
    );
  }, [overview, id]);

  // Si no viene en el panel (p. ej. una solicitud vieja enlazada desde el log), se pide aparte.
  const fetchOne = useCallback(() => api.get<RequestView>(`/api/pbx/requests/${id}`), [id]);
  const { data: fetched, error: fetchError, loading } = usePolling(fetchOne, 3000, { enabled: !!overview && !fromOverview, deps: [id] });
  const request = fromOverview ?? (fetched?.id === id ? fetched : null);
  const alert: AlertView | null = overview?.alerts.find((a) => a.requestId === id) ?? null;

  return (
    <Drawer open onClose={onClose} label="Detalle de la solicitud">
      {request ? (
        <Body key={request.id} request={request} alert={alert} overview={overview} onClose={onClose} onChanged={onChanged} onAck={onAck} />
      ) : (
        <div className="flex-1 flex flex-col">
          <header className="flex items-center justify-between px-4 h-14 border-b border-border bg-background safe-top">
            <span className="tenue">Solicitud #{shortId(id)}</span>
            <CloseButton onClose={onClose} />
          </header>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center text-muted">
            {fetchError && !loading ? (
              <>
                <p className="text-sm text-rojo">{errorMessage(fetchError)}</p>
                <Button variant="secondary" onClick={onClose}>
                  Volver a la central
                </Button>
              </>
            ) : (
              <>
                <Spinner size="lg" />
                <p className="text-sm">Cargando solicitud…</p>
              </>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar"
      className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-border bg-background hover:bg-surface text-2xl leading-none"
    >
      ×
    </button>
  );
}

// ---------- Cuerpo ----------

function Body({
  request: r,
  alert,
  overview,
  onClose,
  onChanged,
  onAck,
}: {
  request: RequestView;
  alert: AlertView | null;
  overview: PbxOverview | null;
  onClose: () => void;
  onChanged: Props["onChanged"];
  onAck: Props["onAck"];
}) {
  const now = useNow(1000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const assignable = ASSIGNABLE_STATUSES.includes(r.status);
  const assigned = ASSIGNED_STATUSES.includes(r.status);
  const cancellable = CANCELLABLE_STATUSES.includes(r.status);
  const finished = r.status === "COMPLETED" || r.status === "CANCELLED";

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  function onAssigned(res: AssignResult) {
    if (res.invite) {
      setInvite({ forRequest: r.id, accessLink: res.invite.accessLink, whatsapp: res.invite.whatsapp, name: res.request.provider?.name ?? "El piloto" });
    }
    setError(null);
    void onChanged();
  }

  const showInvite = invite && invite.forRequest === r.id;

  return (
    <>
      <header className="flex items-start gap-2 px-3.5 py-3 border-b border-border bg-background safe-top">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={r.status} />
            <Pill tone="neutral">
              {KIND_ICONS[r.kind]} {KIND_LABELS[r.kind]}
            </Pill>
            <Pill tone={r.isMember ? "success" : "neutral"}>{r.isMember ? "Socio" : "No socio"}</Pill>
            <span className="tenue chico">
              #{shortId(r.id)} · {relativeTime(r.timestamps.createdAt, now)}
            </span>
          </div>
          <h2 className="text-[22px] truncate mt-1">
            {r.client?.name ?? "Conductor"} <span className="text-muted font-semibold">· {formatQ(r.priceTotal)}</span>
          </h2>
        </div>
        <CloseButton onClose={onClose} />
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-3 safe-bottom [&>*]:min-w-0">
        {alert && (
          <Notice tone={alert.acknowledgedAt ? "warning" : "danger"} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">⚠ {escalationReasonLabel(alert.reason)}</p>
                <p className="chico opacity-90">
                  Alerta {relativeTime(alert.createdAt, now)}
                  {alert.acknowledgedAt ? ` · atiende ${alert.acknowledgedBy ?? "la central"} ${relativeTime(alert.acknowledgedAt, now)}` : " · sin atender"}
                </p>
              </div>
              {!alert.acknowledgedAt && (
                <Button size="sm" loading={busy === "ack"} onClick={() => run("ack", () => onAck(alert.id))}>
                  Atender
                </Button>
              )}
            </div>
          </Notice>
        )}

        <ErrorText>{error}</ErrorText>

        <StatusStrip r={r} now={now} />

        {/* Quién y dónde: lo primero que necesita quien tiene al conductor en la línea. */}
        <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
          <Box>
            <SectionTitle>Conductor</SectionTitle>
            {r.client ? (
              <>
                <p className="text-base font-bold">{r.client.name}</p>
                <ContactLinks phone={r.client.phone} whatsapp={r.client.whatsapp} size="md" />
              </>
            ) : (
              <p className="tenue">Sin datos del conductor</p>
            )}
          </Box>
          <Box>
            <SectionTitle>Vehículo</SectionTitle>
            <div>
              <KV k="Tipo" v={VEHICLE_LABELS[r.vehicleKind]} />
              <KV k="Descripción" v={r.vehicleLabel ?? "—"} />
              <KV k="Placa" v={r.plate ?? "—"} mono />
              {r.notes && <KV k="Qué pasó" v={<span className="italic">“{r.notes}”</span>} />}
            </div>
          </Box>
        </div>

        {showInvite && <InviteBox accessLink={invite.accessLink} whatsapp={invite.whatsapp} name={invite.name} title={`Enlace para ${invite.name}`} />}

        {/* Acciones según estado */}
        {assignable && (
          <Box tone={r.status === "ESCALATED" ? "danger" : "warning"}>
            <SectionTitle
              right={
                r.status === "ESCALATED" ? (
                  <Button size="sm" variant="secondary" loading={busy === "retry"} onClick={() => run("retry", () => api.post(`/api/pbx/requests/${r.id}/retry`))}>
                    Reintentar búsqueda
                  </Button>
                ) : undefined
              }
            >
              {r.status === "ESCALATED" ? "Asignar grúa a mano" : "Asignar sin esperar la cascada"}
            </SectionTitle>
            <AssignPanel request={r} providers={overview?.providers ?? []} onAssigned={onAssigned} />
          </Box>
        )}

        {r.provider && <ProviderBox r={r} now={now} />}

        {cancellable && (
          <Box tone={cancelOpen ? "danger" : undefined}>
            {cancelOpen ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-[17px] font-semibold text-rojo">¿Cancelar la solicitud?</h3>
                <p className="tenue chico">
                  {assigned ? "El piloto asignado quedará libre y se avisará al conductor. " : ""}
                  Cancelar desde la central no cobra al conductor.
                </p>
                <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motivo (opcional, lo ve el equipo)" maxLength={200} />
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)} disabled={busy === "cancel"}>
                    No
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    loading={busy === "cancel"}
                    onClick={() =>
                      run("cancel", async () => {
                        await api.post(`/api/pbx/requests/${r.id}/cancel`, { reason: cancelReason.trim() || undefined });
                        setCancelOpen(false);
                      })
                    }
                  >
                    Sí, cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="tenue chico">La central puede cancelar en cualquier momento sin cargo al conductor.</span>
                <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>
                  Cancelar
                </Button>
              </div>
            )}
          </Box>
        )}

        {/* Lugar */}
        <Box>
          <SectionTitle>Dónde está y a dónde va</SectionTitle>
          <div className="flex flex-col gap-2">
            <PlaceRow icon="🚗" label="Dónde está" place={r.pickup} />
            {r.dropoff && <PlaceRow icon="🏁" label="A dónde va" place={r.dropoff} />}
            <p className="tenue chico">{r.kind === "TOW" ? `Remolque estimado ${formatKm(r.distanceKm)}` : "Asistencia en el lugar"}</p>
          </div>
          <div className="mapa-marco h-48">
            <DetailMap r={r} />
          </div>
        </Box>

        <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
          <Box className="precio">
            <SectionTitle>Precio fijo</SectionTitle>
            <div>
              {r.quote.lines.map((l, i) => (
                <KV key={i} k={l.label} v={formatQ(l.amountQ)} />
              ))}
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-bold">Total en efectivo</span>
              <span className="grande tabular-nums">{formatQ(r.quote.totalQ)}</span>
            </div>
            <p className="tenue chico">{r.quote.summary} · Pago en efectivo al gruero.</p>
            <div className="pt-2 border-t border-border/60">
              <KV k="Pago al piloto" v={formatQ(r.quote.providerPayoutQ)} />
              <KV k="Ingreso GruaYa" v={formatQ(r.quote.platformRevenueQ)} />
            </div>
            {r.cancellation && (
              <p className="chico text-rojo">
                Cancelada por {CANCELLED_BY_LABELS[r.cancellation.by] ?? r.cancellation.by}
                {r.cancellation.reason ? ` · “${r.cancellation.reason}”` : ""} · cargo {formatQ(r.cancellation.feeQ)}
              </p>
            )}
          </Box>
          <Box>
            <SectionTitle>PIN y asignación</SectionTitle>
            <div>
              <p className="tenue chico">PIN de inicio</p>
              <p className="grande font-mono tracking-[0.3em]">{r.pin ?? "—"}</p>
              <p className="tenue chico">El conductor se lo dice al gruero al empezar.</p>
            </div>
            <div className="pt-2 border-t border-border/60">
              <KV k="Asignado por" v={r.assignedBy ? ASSIGNED_BY_LABELS[r.assignedBy] ?? r.assignedBy : "—"} />
              <KV k="Búsqueda" v={`Intento ${r.search.epoch} · ${r.search.offersSent}/${r.search.maxOffers} ofertas`} />
              {r.escalation && (
                <KV
                  k="Pasó a la central"
                  v={
                    <>
                      {formatTime(r.escalation.at)} · {escalationReasonLabel(r.escalation.reason)}
                      {r.escalation.acknowledgedBy && <span className="text-muted"> · {r.escalation.acknowledgedBy}</span>}
                    </>
                  }
                />
              )}
              {finished && <KV k="Calificaciones" v={`Conductor → piloto: ${r.ratings.client ?? "—"} · Piloto → conductor: ${r.ratings.provider ?? "—"}`} />}
            </div>
          </Box>
        </div>

        <Box>
          <SectionTitle>Tiempos</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4">
            <KV k="Creada" v={formatDateTime(r.timestamps.createdAt)} />
            <KV k="Asignada" v={r.timestamps.assignedAt ? formatTime(r.timestamps.assignedAt) : "—"} />
            <KV k="Llegó" v={r.timestamps.arrivedAt ? formatTime(r.timestamps.arrivedAt) : "—"} />
            <KV k="Inició" v={r.timestamps.startedAt ? formatTime(r.timestamps.startedAt) : "—"} />
            <KV k="Terminó" v={r.timestamps.completedAt ? formatTime(r.timestamps.completedAt) : "—"} />
            <KV k="Cancelada" v={r.timestamps.cancelledAt ? formatTime(r.timestamps.cancelledAt) : "—"} />
          </div>
        </Box>

        <Box>
          <SectionTitle right={<span className="tenue chico">{r.events.length} eventos</span>}>Línea de tiempo</SectionTitle>
          <Timeline r={r} overview={overview} />
        </Box>
      </div>
    </>
  );
}

// ---------- Qué está pasando ahora (tarjeta de estado con borde de color) ----------

function StatusStrip({ r, now }: { r: RequestView; now: number }) {
  const offer = r.search.currentOffer;
  const live = r.providerLive;
  const title = statusLabelFor(r.status, r.kind);
  if (r.status === "SEARCHING") {
    const left = offer ? secondsUntil(offer.expiresAt, now) : null;
    const deadline = secondsUntil(r.search.deadlineAt, now);
    return (
      <StatusCard status={r.status} title={title}>
        <p className="tenue flex items-center gap-2">
          <Spinner size="sm" />
          <span>
            {offer ? (
              <>
                Oferta {offer.round} → <b className="text-foreground">{offer.providerName}</b>, expira en <b className={cn("tabular-nums", left != null && left <= 10 ? "text-rojo" : "text-foreground")}>{left} s</b>
              </>
            ) : (
              "Ofreciendo el servicio a la grúa más cercana…"
            )}
          </span>
        </p>
        <p className="tenue chico">
          {r.search.offersSent}/{r.search.maxOffers} ofertas · pasa a la central en {formatMinutes(Math.ceil(deadline / 60))}
        </p>
      </StatusCard>
    );
  }
  if (r.status === "ESCALATED") {
    return (
      <StatusCard status={r.status} title={`Sin grúa · pasó a la central ${r.escalation ? relativeTime(r.escalation.at, now) : ""}`}>
        <p className="tenue">
          {r.escalation ? escalationReasonLabel(r.escalation.reason) : "Sin motivo registrado"} · {r.search.offersSent}/{r.search.maxOffers} ofertas enviadas. Asigna una grúa o reintenta la búsqueda.
        </p>
      </StatusCard>
    );
  }
  if (ASSIGNED_STATUSES.includes(r.status)) {
    return (
      <StatusCard status={r.status} title={title}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {r.provider && (
              <p className="font-semibold truncate">
                {glyphFor(r.provider.kind)} {r.provider.name}
              </p>
            )}
            <p className="tenue">
              {live ? (
                <>
                  {live.target === "PICKUP" ? "Llega al vehículo en" : "Llega al destino en"} <b className="text-foreground">{formatMinutes(live.etaMinutes)}</b> · {formatKm(live.distanceKm)} · señal{" "}
                  {relativeTime(live.updatedAt, now)}
                </>
              ) : (
                <span className="text-rojo font-semibold">Sin ubicación del piloto todavía</span>
              )}
            </p>
          </div>
          {live && (
            <LinkButton href={mapsLink(live)} size="sm" title="Ubicación del piloto en Google Maps">
              🗺️
            </LinkButton>
          )}
        </div>
      </StatusCard>
    );
  }
  return (
    <StatusCard status={r.status} title={title}>
      <p className="tenue">{formatDateTime(r.timestamps.completedAt ?? r.timestamps.cancelledAt ?? r.updatedAt)}</p>
    </StatusCard>
  );
}

// ---------- Lugar ----------

function PlaceRow({ icon, label, place }: { icon: string; label: string; place: RequestView["pickup"] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base leading-6" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="tenue chico">{label}</p>
        <p className="text-sm font-semibold break-words">{placeLabel(place)}</p>
        {place.address && <p className="text-[11px] text-muted font-mono">{coordsLabel(place)}</p>}
      </div>
      <LinkButton href={mapsLink(place)} size="sm" title="Abrir en Google Maps">
        🗺️
      </LinkButton>
    </div>
  );
}

function DetailMap({ r }: { r: RequestView }) {
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [{ id: "pickup", lat: r.pickup.lat, lng: r.pickup.lng, kind: "pickup", label: "Vehículo" }];
    if (r.dropoff) out.push({ id: "dropoff", lat: r.dropoff.lat, lng: r.dropoff.lng, kind: "dropoff", label: "Destino" });
    if (r.providerLive && r.provider) {
      out.push({
        id: "provider",
        lat: r.providerLive.lat,
        lng: r.providerLive.lng,
        kind: "provider-busy",
        heading: r.providerLive.heading,
        glyph: glyphFor(r.provider.kind),
        label: r.provider.name,
      });
    }
    return out;
  }, [r.pickup, r.dropoff, r.providerLive, r.provider]);
  const polyline = useMemo(() => (r.dropoff ? [r.pickup, r.dropoff] : undefined), [r.pickup, r.dropoff]);
  return <MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers zoom={14} />;
}

// ---------- Piloto ----------

function ProviderBox({ r, now }: { r: RequestView; now: number }) {
  const p = r.provider!;
  const live = r.providerLive;
  return (
    <Box tone={ASSIGNED_STATUSES.includes(r.status) ? "info" : undefined}>
      <SectionTitle right={p.isExternal ? <Pill tone="neutral">externo</Pill> : <Pill tone="success">de la red</Pill>}>Piloto asignado</SectionTitle>
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none" aria-hidden>
          {glyphFor(p.kind)}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div>
            <p className="text-base font-bold truncate">{p.name}</p>
            <p className="tenue chico">
              {[p.plate, p.vehicleLabel ?? PROVIDER_KIND_LABELS[p.kind], p.rating != null ? `★ ${p.rating.toFixed(1)} (${p.ratingCount})` : "★ sin calificar"].filter(Boolean).join(" · ")}
            </p>
          </div>
          {p.phone && <ContactLinks phone={p.phone} whatsapp={p.whatsapp} />}
        </div>
      </div>
      {ASSIGNED_STATUSES.includes(r.status) && (
        <div className="pt-2 border-t border-border/60">
          {live ? (
            <KV
              k={live.target === "PICKUP" ? "Hacia el vehículo" : "Hacia el destino"}
              v={
                <>
                  <b>{formatMinutes(live.etaMinutes)}</b> · {formatKm(live.distanceKm)} · señal {relativeTime(live.updatedAt, now)}
                </>
              }
            />
          ) : (
            <p className="chico text-rojo">Sin ubicación todavía. Si es externo, pídele que abra su enlace.</p>
          )}
        </div>
      )}
    </Box>
  );
}

// ---------- Línea de tiempo ----------

function Timeline({ r, overview }: { r: RequestView; overview: PbxOverview | null }) {
  const { byId, byOffer } = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of overview?.providers ?? []) byId.set(p.id, p.name);
    if (r.provider) byId.set(r.provider.id, r.provider.name);
    const byOffer = new Map<string, string>();
    for (const e of r.events) {
      if (e.type === "OFFER_SENT" && e.data) {
        const oid = str(e.data.offerId);
        const name = str(e.data.providerName);
        const pid = str(e.data.providerId);
        if (oid && name) byOffer.set(oid, name);
        if (pid && name) byId.set(pid, name);
      }
    }
    return { byId, byOffer };
  }, [r.events, r.provider, overview?.providers]);

  // Más reciente primero; con la misma marca de tiempo, el último registrado va arriba.
  const events = useMemo(
    () =>
      r.events
        .map((e, i) => ({ e, i }))
        .sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i)
        .map(({ e }) => e),
    [r.events],
  );
  if (events.length === 0) return <p className="tenue">Sin eventos.</p>;
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => (
        <li key={`${e.type}-${e.at}-${i}`} className="flex gap-3 py-1.5 border-b border-border/60 last:border-0">
          <time className="tenue chico tabular-nums whitespace-nowrap w-[4.75rem] shrink-0 pt-0.5" dateTime={e.at} title={formatDateTime(e.at)}>
            {formatTime(e.at)}
          </time>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", isOfferEvent(e) && "text-foreground", e.type === "ESCALATED" && "text-rojo font-semibold", e.type === "CANCELLED" && "text-rojo font-semibold")}>
              {PBX_EVENT_OVERRIDES[e.type] ?? EVENT_LABELS[e.type] ?? e.type}
            </p>
            <EventDetail e={e} byId={byId} byOffer={byOffer} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function EventDetail({ e, byId, byOffer }: { e: RequestEventView; byId: Map<string, string>; byOffer: Map<string, string> }) {
  const d = e.data;
  if (!d) return null;
  if (isOfferEvent(e)) {
    const name = providerNameFrom(d, byId, byOffer) ?? "piloto";
    const round = num(d.round);
    const km = num(d.distanceKm);
    return (
      <p className="tenue chico font-mono">
        piloto: {name}
        {round != null ? ` · ronda ${round}` : ""}
        {` · respuesta: ${OFFER_RESPONSE_LABELS[e.type] ?? e.type.replace("OFFER_", "").toLowerCase()}`}
        {km != null ? ` · ${formatKm(km)}` : ""}
      </p>
    );
  }
  switch (e.type) {
    case "ESCALATED": {
      const reason = str(d.reason);
      return reason ? <p className="tenue chico">{escalationReasonLabel(reason)}</p> : null;
    }
    case "ASSIGNED": {
      const name = providerNameFrom(d, byId, byOffer);
      const by = str(d.by);
      return (
        <p className="tenue chico">
          {name ?? "piloto"}
          {by ? ` · ${ASSIGNED_BY_LABELS[by] ?? by}` : ""}
          {d.external === true ? " · externo" : ""}
        </p>
      );
    }
    case "CANCELLED": {
      const by = str(d.by);
      const reason = str(d.reason);
      const fee = num(d.feeQ);
      return (
        <p className="tenue chico">
          por {by ? CANCELLED_BY_LABELS[by] ?? by : "—"}
          {reason ? ` · “${reason}”` : ""}
          {fee != null && fee > 0 ? ` · cargo ${formatQ(fee)}` : ""}
        </p>
      );
    }
    case "PROVIDER_CANCELLED": {
      const name = providerNameFrom(d, byId, byOffer);
      const reason = str(d.reason);
      return (
        <p className="tenue chico">
          {name ?? "piloto"}
          {reason ? ` · “${reason}”` : ""}
        </p>
      );
    }
    case "SEARCH_RESTARTED": {
      const epoch = num(d.epoch);
      return epoch != null ? <p className="tenue chico">intento {epoch}</p> : null;
    }
    case "CREATED": {
      const price = num(d.priceTotal);
      return price != null ? (
        <p className="tenue chico">
          {formatQ(price)} · {d.isMember === true ? "socio" : "no socio"}
        </p>
      ) : null;
    }
    case "RATED": {
      const stars = num(d.stars);
      return stars != null ? <p className="chico text-amarillo">{"★".repeat(stars)}</p> : null;
    }
    default:
      return null;
  }
}
