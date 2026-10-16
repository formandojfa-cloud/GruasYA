"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { Button, Input, Notice, Row, Sheet, StatusPill } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { formatKm, formatMinutes, formatQ, KIND_ICONS, KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { RequestView } from "@/lib/types";
import { Avatar, DriverPanel, LinkButton } from "./bits";
import type { DriverPosition } from "./useLocationReporter";
import { googleMapsUrl, initialOf, placeLabel, telHref, wazeUrl } from "./util";

type Transition = "ARRIVED" | "IN_PROGRESS" | "COMPLETED";

const CANCEL_REASONS = ["El cliente no aparece", "Problema con mi vehículo", "Demasiado lejos / tráfico", "Otro"];

/**
 * Servicio activo: EN_ROUTE → ARRIVED → (PIN) IN_PROGRESS → COMPLETED.
 * Una sola acción principal por estado; "Cancelar servicio" como secundaria.
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
  // Encuadre automático breve (al entrar y al pedirlo); luego el gruero manda.
  const [fit, setFit] = useState(true);
  useEffect(() => {
    if (!fit) return;
    const t = setTimeout(() => setFit(false), 2500);
    return () => clearTimeout(t);
  }, [fit]);

  const inProgress = job.status === "IN_PROGRESS";
  const target: LatLng = inProgress && job.dropoff ? job.dropoff : job.pickup;
  const targetName = inProgress && job.dropoff ? "destino" : "punto de recogida";

  const markers: MapMarker[] = [
    ...(position ? [{ id: "me", lat: position.lat, lng: position.lng, kind: "me" as const, label: "Tú" }] : []),
    { id: "pickup", lat: job.pickup.lat, lng: job.pickup.lng, kind: "pickup", label: "Recogida" },
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
  const headline = job.status === "EN_ROUTE" ? "Ve al punto de recogida" : job.status === "ARRIVED" ? "Estás en el punto de recogida" : job.dropoff ? "Lleva el vehículo al destino" : "Servicio en curso";
  const sub =
    job.status === "ARRIVED"
      ? "Pide el PIN de 4 dígitos al cliente para iniciar."
      : live
        ? `${formatKm(live.distanceKm)} · ${formatMinutes(live.etaMinutes)} hasta el ${targetName}`
        : `Hacia el ${targetName}`;
  const vehicle = [VEHICLE_LABELS[job.vehicleKind], job.vehicleLabel, job.plate].filter(Boolean).join(" · ");

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1">
        <MapView className="h-full w-full" markers={markers} polyline={polyline} fitToMarkers={fit} center={target} zoom={14} />

      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3 safe-top">
        <div className="rounded-full border border-border bg-background/95 px-3 py-1.5 text-sm font-semibold shadow-md backdrop-blur">
          {KIND_ICONS[job.kind]} {KIND_LABELS[job.kind]}
        </div>
        <button
          type="button"
          onClick={() => setFit(true)}
          aria-label="Centrar mapa"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-lg shadow-md backdrop-blur"
        >
          ⌖
        </button>
      </div>
      </div>

      <DriverPanel className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight">{headline}</h1>
            <p className="mt-0.5 text-sm text-muted">{sub}</p>
          </div>
          <StatusPill status={job.status} />
        </div>

        {job.client && (
          <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
            <Avatar initial={initialOf(job.client.name)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{job.client.name}</p>
              <p className="text-xs text-muted">Cliente</p>
            </div>
            <LinkButton href={telHref(job.client.phone)} size="sm">
              📞 Llamar
            </LinkButton>
            <LinkButton href={job.client.whatsapp} size="sm" external variant="success">
              WhatsApp
            </LinkButton>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          <li className={`flex gap-3 ${inProgress ? "opacity-60" : ""}`}>
            <span aria-hidden className="mt-0.5 leading-none">
              📍
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recogida</p>
              <p className="text-sm font-semibold leading-snug">{placeLabel(job.pickup)}</p>
            </div>
          </li>
          {job.dropoff && (
            <li className="flex gap-3">
              <span aria-hidden className="mt-0.5 leading-none">
                🏁
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Destino</p>
                <p className="text-sm font-semibold leading-snug">{placeLabel(job.dropoff)}</p>
              </div>
            </li>
          )}
          <li className="flex gap-3">
            <span aria-hidden className="mt-0.5 leading-none">
              🚗
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Vehículo</p>
              <p className="text-sm font-semibold leading-snug">{vehicle}</p>
              {job.notes && <p className="text-xs italic text-muted">“{job.notes}”</p>}
            </div>
          </li>
        </ul>

        <div className="rounded-2xl border border-border px-4 py-1">
          <Row label="Ganas" value={formatQ(job.quote.providerPayoutQ)} strong />
          <Row label="Cobra al cliente (efectivo)" value={formatQ(job.priceTotal)} />
          {job.kind === "TOW" && <Row label="Remolque" value={formatKm(job.distanceKm)} />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <LinkButton href={googleMapsUrl(target)} external>
            🗺️ Google Maps
          </LinkButton>
          <LinkButton href={wazeUrl(target)} external>
            🚘 Waze
          </LinkButton>
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
                className={`h-16 text-center text-3xl font-black tracking-[0.6em] ${pinError ? "border-danger ring-2 ring-danger" : ""}`}
                disabled={busy !== null}
              />
              {pinError ? <span className="mt-1 block text-sm font-semibold text-danger">{pinError}</span> : <span className="mt-1 block text-xs text-muted">El cliente lo ve en su app. Se envía solo al escribir los 4 dígitos.</span>}
            </label>
            <Button type="submit" size="lg" fullWidth loading={busy === "IN_PROGRESS"} disabled={pin.length !== 4 || busy !== null}>
              Iniciar servicio
            </Button>
          </form>
        )}

        {job.status === "IN_PROGRESS" && (
          <Button size="lg" fullWidth variant="success" loading={busy === "COMPLETED"} disabled={busy !== null} onClick={() => void transition("COMPLETED")}>
            Completar servicio
          </Button>
        )}

        {(job.status === "EN_ROUTE" || job.status === "ARRIVED") && (
          <Button variant="ghost" fullWidth className="text-danger" disabled={busy !== null} onClick={() => setCancelOpen(true)}>
            Cancelar servicio
          </Button>
        )}
      </DriverPanel>

      <Sheet open={cancelOpen} onClose={() => busy === null && setCancelOpen(false)} title="¿Cancelar este servicio?">
        <p className="mb-3 text-sm text-muted">La solicitud se ofrecerá a otra grúa o la atenderá el PBX. Cancelar seguido afecta tu calificación.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setCancelReason(r)}
              className={`h-10 rounded-full border px-3 text-sm font-semibold ${cancelReason === r ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-surface"}`}
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
          <Button variant="ghost" fullWidth disabled={busy !== null} onClick={() => setCancelOpen(false)}>
            Volver
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
