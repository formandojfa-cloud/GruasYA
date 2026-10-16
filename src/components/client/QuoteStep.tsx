"use client";

/** Cotización antes de pedir: desglose, total y botón "Pedir grúa". */
import { useEffect, useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Button, Input, Notice, Spinner } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";
import { formatKm, formatMinutes, formatQ, KIND_ICONS, KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { ClientSelf, CreateRequestInput, Place, Quote, RequestView, ServiceKind } from "@/lib/types";
import { BackButton } from "./bits";
import { apiErrorMessage, isLightKind, NON_MEMBER_TOW_FEE_Q, placeLabel, VEHICLE_ICONS } from "./constants";
import { MapScreen } from "./MapScreen";
import { QuoteLines } from "./RequestCard";
import type { VehicleDraft } from "./useVehicle";

type QuoteResponse = { quote: Quote; distanceKm: number; towMinutes: number; isMember: boolean };

type Props = {
  kind: ServiceKind;
  pickup: Place;
  dropoff: Place | null;
  vehicle: VehicleDraft;
  me: ClientSelf;
  onBack: () => void;
  onEditPickup: () => void;
  onEditDropoff: () => void;
  onCreated: (req: RequestView) => void;
  /** La API respondió ACTIVE_REQUEST_EXISTS: hay que retomar el servicio en curso. */
  onActiveExists: () => void;
};

export function QuoteStep({ kind, pickup, dropoff, vehicle, me, onBack, onEditPickup, onEditDropoff, onCreated, onActiveExists }: Props) {
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [notes, setNotes] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const light = isLightKind(kind);
  const pLat = pickup.lat;
  const pLng = pickup.lng;
  const dLat = dropoff?.lat;
  const dLng = dropoff?.lng;

  useEffect(() => {
    let cancelled = false;
    const body = { kind, pickup: { lat: pLat, lng: pLng }, ...(dLat != null && dLng != null ? { dropoff: { lat: dLat, lng: dLng } } : {}) };
    api.post<QuoteResponse>("/api/quote", body).then(
      (res) => {
        if (!cancelled) setQuote(res);
      },
      (e: unknown) => {
        if (!cancelled) setQuoteError(apiErrorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, pLat, pLng, dLat, dLng, attempt]);

  function retry() {
    setQuoteError(null);
    setAttempt((a) => a + 1);
  }

  async function create() {
    setRequesting(true);
    setRequestError(null);
    const body: CreateRequestInput = {
      kind,
      vehicleKind: vehicle.vehicleKind,
      vehicleLabel: vehicle.vehicleLabel || undefined,
      plate: vehicle.plate || undefined,
      notes: notes.trim() || undefined,
      pickup,
      dropoff: dropoff ?? undefined,
    };
    try {
      const created = await api.post<RequestView>("/api/requests", body);
      onCreated(created);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "ACTIVE_REQUEST_EXISTS") {
        onActiveExists();
        return;
      }
      setRequestError(apiErrorMessage(e));
    } finally {
      setRequesting(false);
    }
  }

  const markers: MapMarker[] = [{ id: "pickup", lat: pickup.lat, lng: pickup.lng, kind: "pickup", label: "Recogida" }];
  if (dropoff) markers.push({ id: "dropoff", lat: dropoff.lat, lng: dropoff.lng, kind: "dropoff", label: "Destino" });
  const polyline: LatLng[] | undefined = dropoff ? [pickup, dropoff] : undefined;

  const isMember = quote?.isMember ?? me.isMember;
  const total = quote?.quote.totalQ ?? 0;
  const vehicleText = [VEHICLE_LABELS[vehicle.vehicleKind], vehicle.vehicleLabel, vehicle.plate].filter(Boolean).join(" · ");

  return (
    <MapScreen
      mapClassName="h-[36dvh]"
      map={<MapView center={pickup} zoom={14} markers={markers} polyline={polyline} fitToMarkers interactive={false} className="h-full w-full" />}
      top={<BackButton onClick={onBack} />}
    >
      <>
        <h2 className="text-xl font-bold">
          <span aria-hidden>{KIND_ICONS[kind]}</span> {KIND_LABELS[kind]}
        </h2>
        <div className="mt-3 divide-y divide-border rounded-2xl border border-border">
          <PlaceRow icon="📍" label="Recogida" value={placeLabel(pickup)} onEdit={onEditPickup} />
          {dropoff && <PlaceRow icon="🏁" label="Destino" value={placeLabel(dropoff)} onEdit={onEditDropoff} />}
          <PlaceRow icon={VEHICLE_ICONS[vehicle.vehicleKind]} label="Vehículo" value={vehicleText} />
        </div>

        {!quote && !quoteError && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Calculando precio…
          </div>
        )}
        {quoteError && (
          <Notice tone="danger" className="mt-3 flex items-center justify-between gap-3">
            <span>{quoteError}</span>
            <Button size="sm" variant="secondary" onClick={retry}>
              Reintentar
            </Button>
          </Notice>
        )}

        {quote && (
          <div className="mt-3">
            {kind === "TOW" && (
              <p className="text-sm text-muted">
                {formatKm(quote.distanceKm)} de remolque · aprox. {formatMinutes(quote.towMinutes)}
              </p>
            )}
            {kind === "TOW" && quote.distanceKm < 0.05 && (
              <Notice tone="warning" className="mt-2 text-xs">
                El destino está en el mismo punto que la recogida. Si quieres que llevemos tu vehículo a otro lugar, edita el destino.
              </Notice>
            )}
            <div className="mt-1">
              <QuoteLines quote={quote.quote} total={total} />
            </div>
            {light && isMember ? (
              <Notice tone="success" className="mt-2 font-semibold">
                ✓ Incluido en tu membresía
              </Notice>
            ) : (
              <p className="mt-1 text-xs text-muted">
                {quote.quote.summary}
                {total > 0 && " · Pagas en efectivo al terminar"}
              </p>
            )}
            {!isMember && (
              <Notice tone="info" className="mt-2 text-xs">
                Hazte socio: {kind === "TOW" ? `ahorras ${formatQ(NON_MEMBER_TOW_FEE_Q)} en cada grúa` : "esta asistencia iría incluida"} y las asistencias ligeras van sin costo.
              </Notice>
            )}
            <Input
              className="mt-3"
              placeholder="Nota para el gruero (opcional): referencia, color…"
              aria-label="Nota para el gruero"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
            />
            {requestError && (
              <Notice tone="danger" className="mt-2">
                {requestError}
              </Notice>
            )}
            <Button size="lg" fullWidth className="mt-3" loading={requesting} onClick={create}>
              {kind === "TOW" ? "Pedir grúa" : "Pedir asistencia"}
            </Button>
          </div>
        )}
      </>
    </MapScreen>
  );
}

function PlaceRow({ icon, label, value, onEdit }: { icon: string; label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="h-10 px-2 text-sm font-semibold underline-offset-2 hover:underline">
          Editar
        </button>
      )}
    </div>
  );
}
