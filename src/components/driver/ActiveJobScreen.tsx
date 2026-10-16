"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { Button, cn, Input, Notice, Row, Sheet, StatusCard } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { formatKm, formatMinutes, formatQ, KIND_LABELS, statusLabelFor, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { RequestView } from "@/lib/types";
import { Avatar, LinkButton } from "./bits";
import type { DriverPosition } from "./useLocationReporter";
import { googleMapsUrl, initialOf, placeLabel, telHref, wazeUrl } from "./util";

type Transition = "ARRIVED" | "IN_PROGRESS" | "COMPLETED";

const CANCEL_REASONS = ["El cliente no aparece", "Problema con mi vehículo", "Demasiado lejos / tráfico", "Otro"];

/**
 * Servicio activo: EN_ROUTE → ARRIVED → (PIN) IN_PROGRESS → COMPLETED.
 * Tarjeta de estado con borde azul, una sola acción principal por estado;
 * "Cancelar servicio" como secundaria.
 */
export default function ActiveJobScreen({
  job,
  position,
  onUpdated,
  onCompleted,
  onCancelled,
  onRefresh,
}: {
  job: RequestView;
  position: DriverPosition | null;
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
    ...(position ? [{ id: "me", lat: position.lat, lng: position.lng, kind: "me" as const, label: "Tú" }] : []),
    { id: "pickup", lat: job.pickup.lat, lng: job.pickup.lng, kind: "pickup", label: "Cliente" },
    ...(job.dropoff ? [{ id: "dropoff", lat: job.dropoff.lat, lng: job.dropoff.lng, kind: "dropoff" as const, label: "Destino" }] : []),
  ];
  const polyline: LatLng[] = [
    ...(position ? [position] : []),
    ...(!inProgress ? [job.pickup] : []),
    ...(job.dropoff ? [job.dropoff] : []),
  ];

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

  return (
    <>
      <StatusCard status={job.status} title={statusLabelFor(job.status, job.kind)}>
        <p className="tenue -mt-1">{sub}</p>
        <p className="font-semibold">
          Cobrar {formatQ(job.priceTotal)} en efectivo · <span className="font-normal text-muted">{what}</span>
        </p>
        {job.notes && <p className="tenue chico italic">“{job.notes}”</p>}

        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={wazeUrl(target)} external className="whitespace-nowrap">
            Waze
          </LinkButton>
          <LinkButton href={googleMapsUrl(target)} external className="whitespace-nowrap">
            Google Maps
          </LinkButton>
        </div>

        {job.client && (
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface p-2.5">
            <div className="flex min-w-0 flex-1 basis-36 items-center gap-3">
              <Avatar initial={initialOf(job.client.name)} />
              <div className="min-w-0">
                <p className="truncate font-bold">{job.client.name}</p>
                <p className="tenue chico">Cliente</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <LinkButton href={telHref(job.client.phone)} size="sm" className="whitespace-nowrap">
                📞 Llamar
              </LinkButton>
              <LinkButton href={job.client.whatsapp} size="sm" external variant="success" className="whitespace-nowrap">
                WhatsApp
              </LinkButton>
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          <li className={cn("flex gap-2", inProgress && "opacity-60")}>
            <span aria-hidden className="mt-0.5 leading-none">
              🚗
            </span>
            <p className="chico leading-snug">
              <span className="text-muted">Recogida: </span>
              {placeLabel(job.pickup)}
            </p>
          </li>
          {job.dropoff && (
            <li className="flex gap-2">
              <span aria-hidden className="mt-0.5 leading-none">
                🏁
              </span>
              <p className="chico leading-snug">
                <span className="text-muted">Destino: </span>
                {placeLabel(job.dropoff)}
                {job.kind === "TOW" ? ` (${formatKm(job.distanceKm)})` : ""}
              </p>
            </li>
          )}
        </ul>

        <div className="rounded-[10px] bg-surface px-3 py-0.5">
          <Row label="Ganas" value={formatQ(job.quote.providerPayoutQ)} strong />
          <Row label="Cobras al cliente (efectivo)" value={formatQ(job.priceTotal)} />
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        {job.status === "EN_ROUTE" && (
          <Button size="lg" fullWidth loading={busy === "ARRIVED"} disabled={busy !== null} onClick={() => void transition("ARRIVED")}>
            Llegué
          </Button>
        )}

        {job.status === "ARRIVED" && (
          <form
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
                className={cn("h-16 text-center text-3xl font-black tracking-[0.6em]", pinError && "border-rojo ring-2 ring-rojo")}
                disabled={busy !== null}
              />
              {pinError ? <span className="mt-1 block text-sm font-semibold text-rojo">{pinError}</span> : <span className="mt-1 block text-xs text-muted">El cliente lo ve en su app. Se envía solo al escribir los 4 dígitos.</span>}
            </label>
            <Button type="submit" size="lg" fullWidth loading={busy === "IN_PROGRESS"} disabled={pin.length !== 4 || busy !== null}>
              {job.kind === "TOW" ? "Vehículo cargado, en ruta" : "Iniciar servicio"}
            </Button>
          </form>
        )}

        {job.status === "IN_PROGRESS" && (
          <Button size="lg" fullWidth loading={busy === "COMPLETED"} disabled={busy !== null} onClick={() => void transition("COMPLETED")}>
            {job.kind === "TOW" ? `Entregado y cobré ${formatQ(job.priceTotal)}` : `Terminé y cobré ${formatQ(job.priceTotal)}`}
          </Button>
        )}

        {(job.status === "EN_ROUTE" || job.status === "ARRIVED") && (
          <Button variant="danger" fullWidth disabled={busy !== null} onClick={() => setCancelOpen(true)}>
            Cancelar servicio
          </Button>
        )}
      </StatusCard>

      <section className="tarjeta" aria-label="Mapa">
        <div className="mapa-marco">
          <MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers={fit} center={target} zoom={14} />
          <button
            type="button"
            onClick={() => setFit(true)}
            aria-label="Centrar mapa"
            className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-lg shadow-md"
          >
            ⌖
          </button>
        </div>
      </section>

      <Sheet open={cancelOpen} onClose={() => busy === null && setCancelOpen(false)} title="¿Cancelar este servicio?">
        <p className="tenue mb-3">La solicitud se ofrecerá a otra grúa o la atenderá la central. Cancelar seguido afecta tu calificación.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setCancelReason(r)}
              aria-pressed={cancelReason === r}
              className={cn("h-10 rounded-full border px-3 text-sm font-semibold", cancelReason === r ? "border-foreground bg-foreground text-background" : "border-border bg-background")}
            >
              {r}
            </button>
          ))}
        </div>
        {cancelReason === "Otro" && <Input value={cancelOther} onChange={(e) => setCancelOther(e.target.value)} placeholder="Cuéntanos el motivo" maxLength={200} className="mb-3" />}
        <div className="flex flex-col gap-2">
          <Button variant="danger" size="lg" fullWidth loading={busy === "CANCEL"} onClick={() => void cancel()}>
            Sí, cancelar servicio
          </Button>
          <Button variant="secondary" fullWidth disabled={busy !== null} onClick={() => setCancelOpen(false)}>
            Volver
          </Button>
        </div>
      </Sheet>
    </>
  );
}
