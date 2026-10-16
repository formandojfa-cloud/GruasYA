"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { BottomPanel, Button, cn, Input, Notice, Sheet } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { formatKm, formatMinutes, formatQ, KIND_LABELS, statusLabelFor, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { ProviderSelf, RequestView } from "@/lib/types";
import { GpsPill, LinkButton, MapOverlay, MapScreen, providerGlyph, SheetRow } from "./bits";
import type { DriverPosition, LocationReporter } from "./useLocationReporter";
import { googleMapsUrl, initialOf, placeLabel, telHref, wazeUrl } from "./util";

type Transition = "ARRIVED" | "IN_PROGRESS" | "COMPLETED";

const CANCEL_REASONS = ["El cliente no aparece", "Problema con mi vehículo", "Demasiado lejos / tráfico", "Otro"];

/**
 * Servicio activo: EN_ROUTE → ARRIVED → (PIN) IN_PROGRESS → COMPLETED.
 * Mapa con el cliente (punto), el destino (cuadrado) y tu grúa; hoja con el
 * estado, el cobro, el cliente (llamar / WhatsApp), Waze / Google Maps, el PIN
 * y una sola acción principal negra; "Cancelar servicio" en rojo.
 */
export default function ActiveJobScreen({
  self,
  job,
  position,
  loc,
  onUpdated,
  onCompleted,
  onCancelled,
  onRefresh,
}: {
  self: ProviderSelf;
  job: RequestView;
  position: DriverPosition | null;
  loc: LocationReporter;
  onUpdated: (view: RequestView) => void;
  onCompleted: (view: RequestView) => void;
  onCancelled: (requestStatus: string) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>(CANCEL_REASONS[0]);
  const [cancelOther, setCancelOther] = useState("");
  // Encuadre automático breve (al entrar y al pedirlo); luego el piloto manda.
  const [fit, setFit] = useState(true);
  useEffect(() => {
    if (!fit) return;
    const t = setTimeout(() => setFit(false), 2500);
    return () => clearTimeout(t);
  }, [fit]);

  const inProgress = job.status === "IN_PROGRESS";
  const target: LatLng = inProgress && job.dropoff ? job.dropoff : job.pickup;
  const targetName = inProgress && job.dropoff ? "destino" : "cliente";

  const markers: MapMarker[] = [
    ...(position
      ? [
          {
            id: "me",
            lat: position.lat,
            lng: position.lng,
            kind: "provider" as const,
            heading: position.heading,
            glyph: providerGlyph(self.kind),
            label: "Tú",
          },
        ]
      : []),
    {
      id: "pickup",
      lat: job.pickup.lat,
      lng: job.pickup.lng,
      kind: "pickup",
      label: "Cliente",
    },
    ...(job.dropoff
      ? [
          {
            id: "dropoff",
            lat: job.dropoff.lat,
            lng: job.dropoff.lng,
            kind: "dropoff" as const,
            label: "Destino",
          },
        ]
      : []),
  ];
  const polyline: LatLng[] = [...(position ? [position] : []), ...(!inProgress ? [job.pickup] : []), ...(job.dropoff ? [job.dropoff] : [])];

  const transition = async (to: Transition, pinValue?: string) => {
    setBusy(to);
    setError(null);
    try {
      const body: { to: Transition; pin?: string } = { to };
      if (pinValue) body.pin = pinValue;
      const view = await api.post<RequestView>(`/api/provider/jobs/${job.id}/transition`, body);
      if (to === "COMPLETED") onCompleted(view);
      else {
        onUpdated(view);
        setFit(true);
      }
    } catch (e) {
      if (e instanceof ApiClientError && (e.code === "INVALID_PIN" || e.code === "PIN_REQUIRED")) {
        setPinError(e.message);
        setPin("");
      } else {
        setError(errorMessage(e));
        if (e instanceof ApiClientError && (e.code === "INVALID_TRANSITION" || e.code === "NOT_YOUR_JOB")) onRefresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const onPinChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(v);
    setPinError(null);
    if (v.length === 4 && busy === null) void transition("IN_PROGRESS", v);
  };

  const cancel = async () => {
    setBusy("CANCEL");
    setError(null);
    const reason = cancelReason === "Otro" ? cancelOther.trim() || "Otro" : cancelReason;
    try {
      const r = await api.post<{ ok: boolean; requestStatus: string }>(`/api/provider/jobs/${job.id}/cancel`, { reason });
      setCancelOpen(false);
      onCancelled(r.requestStatus);
    } catch (e) {
      setError(errorMessage(e));
      setCancelOpen(false);
      if (e instanceof ApiClientError && (e.code === "INVALID_STATE" || e.code === "NOT_YOUR_JOB")) onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const live = job.providerLive;
  const sub =
    job.status === "ARRIVED"
      ? "Pide el PIN de 4 dígitos al cliente para iniciar."
      : live
        ? `${targetName === "cliente" ? "Cliente" : "Destino"} a ${formatKm(live.distanceKm)} (${live.etaMinutes < 1 ? "menos de 1 min" : `unos ${formatMinutes(live.etaMinutes)}`})`
        : `Rumbo al ${targetName}`;
  const vehicle = [VEHICLE_LABELS[job.vehicleKind], job.vehicleLabel, job.plate].filter(Boolean).join(" · ");
  const what = job.kind === "TOW" ? vehicle : `${KIND_LABELS[job.kind]} · ${vehicle}`;

  const footer = (
    <>
      {job.status === "EN_ROUTE" && (
        <Button size="lg" fullWidth loading={busy === "ARRIVED"} disabled={busy !== null} onClick={() => void transition("ARRIVED")}>
          Llegué
        </Button>
      )}
      {job.status === "ARRIVED" && (
        <Button type="submit" form="pin-form" size="lg" fullWidth loading={busy === "IN_PROGRESS"} disabled={pin.length !== 4 || busy !== null}>
          {job.kind === "TOW" ? "Vehículo cargado, en ruta" : "Iniciar servicio"}
        </Button>
      )}
      {job.status === "IN_PROGRESS" && (
        <Button size="lg" fullWidth loading={busy === "COMPLETED"} disabled={busy !== null} onClick={() => void transition("COMPLETED")}>
          {job.kind === "TOW" ? `Entregado y cobré ${formatQ(job.priceTotal)}` : `Terminé y cobré ${formatQ(job.priceTotal)}`}
        </Button>
      )}
      {(job.status === "EN_ROUTE" || job.status === "ARRIVED") && (
        <Button variant="danger" fullWidth disabled={busy !== null} onClick={() => setCancelOpen(true)} className="!border-transparent">
          Cancelar servicio
        </Button>
      )}
    </>
  );

  return (
    <MapScreen
      map={<MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers={fit} center={target} zoom={14} />}
      overlay={
        <MapOverlay>
          <div className="flex w-full items-center justify-between gap-2">
            <GpsPill loc={loc} reporting />
            <button type="button" onClick={() => setFit(true)} aria-label="Centrar mapa" className="pildora !px-3 text-lg leading-none">
              ⌖
            </button>
          </div>
        </MapOverlay>
      }
    >
      <BottomPanel footer={footer} height={job.status === "ARRIVED" ? "alta" : "normal"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="titulo-hoja">{statusLabelFor(job.status, job.kind)}</h2>
            <p className="tenue mt-1 text-[15px]">{sub}</p>
          </div>
          <span className="estado-punto en-linea mt-3 !bg-azul" aria-hidden />
        </div>

        <p className="font-semibold">
          Cobrar {formatQ(job.priceTotal)} en efectivo · <span className="font-normal text-muted">{what}</span>
        </p>
        {job.notes && <p className="tenue chico italic">“{job.notes}”</p>}

        {job.client && (
          <div className="persona">
            <div className="avatar text-[20px]" aria-hidden>
              {initialOf(job.client.name)}
            </div>
            <div className="persona-texto">
              <strong className="truncate text-[17px]">{job.client.name}</strong>
              <span className="tenue">Cliente</span>
            </div>
            <LinkButton href={telHref(job.client.phone)} size="icon" ariaLabel={`Llamar a ${job.client.name}`}>
              📞
            </LinkButton>
            <LinkButton href={job.client.whatsapp} size="icon" external variant="success" ariaLabel={`WhatsApp a ${job.client.name}`}>
              💬
            </LinkButton>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={wazeUrl(target)} external className="whitespace-nowrap">
            🧭 Waze
          </LinkButton>
          <LinkButton href={googleMapsUrl(target)} external className="whitespace-nowrap">
            🗺️ Google Maps
          </LinkButton>
        </div>

        {job.status === "ARRIVED" && (
          <form
            id="pin-form"
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pin.length === 4) void transition("IN_PROGRESS", pin);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">PIN del cliente</span>
              <Input
                value={pin}
                onChange={onPinChange}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="one-time-code"
                placeholder="••••"
                aria-invalid={!!pinError}
                aria-label="PIN de 4 dígitos"
                className={cn("h-16 text-center text-3xl font-black tracking-[0.6em]", pinError && "!border-rojo")}
                disabled={busy !== null}
              />
              {pinError ? (
                <span className="mt-1 block text-sm font-semibold text-rojo">{pinError}</span>
              ) : (
                <span className="mt-1 block text-xs text-muted">El cliente lo ve en su app. Se envía solo al escribir los 4 dígitos.</span>
              )}
            </label>
          </form>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <span className="marca-origen mt-1.5" aria-hidden />
            <p className={cn("text-[15px] leading-snug", inProgress && "text-muted line-through")}>
              <span className="text-muted">Recogida: </span>
              {placeLabel(job.pickup)}
            </p>
          </div>
          {job.dropoff && (
            <div className="flex items-start gap-3">
              <span className="marca-destino mt-1.5" aria-hidden />
              <p className="text-[15px] leading-snug">
                <span className="text-muted">Destino: </span>
                {placeLabel(job.dropoff)}
                {job.kind === "TOW" ? ` (${formatKm(job.distanceKm)})` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-[12px] bg-surface-2 px-3 py-2">
          <SheetRow label="Ganas" value={formatQ(job.quote.providerPayoutQ)} className="py-1" />
          <SheetRow label="Cobras al cliente (efectivo)" value={formatQ(job.priceTotal)} className="py-1 text-[15px]" />
        </div>

        {error && <Notice tone="danger">{error}</Notice>}
      </BottomPanel>

      {/* La hoja modal va por encima de la hoja fija (z 1000) y de la barra. */}
      <div className="relative z-[1200]">
        <Sheet open={cancelOpen} onClose={() => busy === null && setCancelOpen(false)} title="¿Cancelar este servicio?">
          <p className="tenue mb-3">La solicitud se ofrecerá a otra grúa o la atenderá la central. Cancelar seguido afecta tu calificación.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {CANCEL_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setCancelReason(r)} aria-pressed={cancelReason === r} className={cn("chip", cancelReason === r && "chip-activo")}>
                {r}
              </button>
            ))}
          </div>
          {cancelReason === "Otro" && <Input value={cancelOther} onChange={(e) => setCancelOther(e.target.value)} placeholder="Cuéntanos el motivo" maxLength={200} className="mb-3" />}
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" fullWidth loading={busy === "CANCEL"} onClick={() => void cancel()}>
              Sí, cancelar servicio
            </Button>
            <Button variant="secondary" fullWidth disabled={busy !== null} onClick={() => setCancelOpen(false)}>
              Volver
            </Button>
          </div>
        </Sheet>
      </div>
    </MapScreen>
  );
}
