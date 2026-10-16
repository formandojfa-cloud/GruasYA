"use client";

/**
 * Hoja "Pedir" del prototipo sobre el mapa completo: bloque recogida/destino,
 * chips "Qué pasó" (van al campo `notes`), opciones GrúaYa Moto/Carro/Camioneta/Pickup
 * y las asistencias ligeras de la membresía, línea plegable con el desglose del
 * precio (/api/quote) y pie con "💵 Pago en efectivo al piloto" + botón negro.
 */
import { useEffect, useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Aviso, Button, Chip, Field, Input, Notice, OptionRow, RouteFields, Select, Sheet, cn } from "@/components/ui";
import { api, ApiClientError } from "@/lib/api";
import { formatKm, formatMinutes, formatQ, KIND_ICONS, KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { ClientSelf, CreateRequestInput, Place, QuoteResponse, RequestView, ServiceKind, VehicleKind } from "@/lib/types";
import type { Draft } from "./ClientApp";
import { ClientScreen } from "./ClientShell";
import {
  apiErrorMessage,
  GUATEMALA_CITY,
  isLightKind,
  KIND_HINTS,
  LIGHT_NON_MEMBER_Q,
  NON_MEMBER_TOW_FEE_Q,
  PROBLEM_CHIPS,
  SERVICE_ORDER,
  shortAddress,
  TOW_BASE_Q,
  VEHICLE_ICONS,
  VEHICLE_OPTIONS,
  VEHICLE_SHORT,
  type ProblemChip,
} from "./constants";
import { useReverseGeocode } from "./geocode";
import type { VehicleDraft } from "./useVehicle";

type Props = {
  me: ClientSelf;
  gps: LatLng | null;
  gpsError: string | null;
  draft: Draft;
  onDraftChange: (d: Draft) => void;
  vehicle: VehicleDraft;
  onVehicleChange: (v: VehicleDraft) => void;
  onEditPickup: () => void;
  onEditDropoff: () => void;
  onCreated: (req: RequestView) => void;
  /** La API respondió ACTIVE_REQUEST_EXISTS: hay que retomar el servicio en curso. */
  onActiveExists: () => void;
};

export function HomeScreen({ me, gps, gpsError, draft, onDraftChange, vehicle, onVehicleChange, onEditPickup, onEditDropoff, onCreated, onActiveExists }: Props) {
  const { kind, dropoff } = draft;
  const light = isLightKind(kind);
  // Sin recogida elegida, la recogida es tu ubicación actual (como el prototipo).
  const usingGps = draft.pickup == null;
  const pickup: Place | null = draft.pickup ?? gps;
  const pickupAddress = useReverseGeocode(pickup && !pickup.address ? pickup : null);
  const pickupLabel = pickup?.address ? shortAddress(pickup.address) : pickupAddress.label ? shortAddress(pickupAddress.label) : null;

  const [problem, setProblem] = useState<ProblemChip | null>(null);
  const [notes, setNotes] = useState("");
  const [vehicleOpen, setVehicleOpen] = useState(false);
  // La cotización se guarda con la clave de sus entradas: si cambian, se vuelve a calcular.
  const [quoted, setQuoted] = useState<{ key: string; quote: QuoteResponse | null; error: string | null }>({ key: "", quote: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Cotización: grúa necesita recogida y destino; asistencia ligera solo recogida.
  const pLat = pickup?.lat;
  const pLng = pickup?.lng;
  const dLat = dropoff?.lat;
  const dLng = dropoff?.lng;
  const canQuote = pLat != null && pLng != null && (light || (dLat != null && dLng != null));
  const quoteKey = canQuote ? [kind, pLat, pLng, light ? "" : dLat, light ? "" : dLng, attempt].join("|") : "";
  useEffect(() => {
    if (!quoteKey || pLat == null || pLng == null) return;
    let cancelled = false;
    const body = { kind, pickup: { lat: pLat, lng: pLng }, ...(!light && dLat != null && dLng != null ? { dropoff: { lat: dLat, lng: dLng } } : {}) };
    api.post<QuoteResponse>("/api/quote", body).then(
      (res) => {
        if (!cancelled) setQuoted({ key: quoteKey, quote: res, error: null });
      },
      (e: unknown) => {
        if (!cancelled) setQuoted({ key: quoteKey, quote: null, error: apiErrorMessage(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [quoteKey, kind, light, pLat, pLng, dLat, dLng]);
  const quote = quoteKey && quoted.key === quoteKey ? quoted.quote : null;
  const quoteError = quoteKey && quoted.key === quoteKey ? quoted.error : null;

  const isMember = quote?.isMember ?? me.isMember;
  const ready = !!quote;
  const total = quote?.quote.totalQ ?? 0;
  const included = light && isMember;
  // Tiempos de la cotización: llegada de la grúa más cercana y duración del remolque.
  const approx = quote?.routeSource === "estimada" ? " aprox." : "";
  const towEta = quote && !light ? `${quote.nearestProvider ? `Llega en ${formatMinutes(quote.nearestProvider.etaMinutes)}` : "Sin grúas cerca ahora"} · Remolque ${formatMinutes(quote.towMinutes)} · ${formatKm(quote.distanceKm)}${approx}` : null;

  function setKind(next: ServiceKind, vehicleKind?: VehicleKind) {
    if (vehicleKind && vehicleKind !== vehicle.vehicleKind) onVehicleChange({ ...vehicle, vehicleKind });
    if (next !== kind) onDraftChange({ ...draft, kind: next });
  }

  async function create() {
    if (!pickup) return onEditPickup();
    if (!light && !dropoff) return onEditDropoff();
    setRequesting(true);
    setRequestError(null);
    const note = [problem && problem !== "Otro" ? problem : null, notes.trim() || null].filter(Boolean).join(": ");
    const body: CreateRequestInput = {
      kind,
      vehicleKind: vehicle.vehicleKind,
      vehicleLabel: vehicle.vehicleLabel || undefined,
      plate: vehicle.plate || undefined,
      notes: note || undefined,
      pickup: { lat: pickup.lat, lng: pickup.lng, address: (pickup.address ?? pickupAddress.label ?? undefined)?.slice(0, 200) },
      dropoff: !light && dropoff ? dropoff : undefined,
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

  // Mapa: recogida (punto), destino (cuadrado) y tu posición.
  const markers: MapMarker[] = [];
  if (pickup) markers.push({ id: "pickup", lat: pickup.lat, lng: pickup.lng, kind: "pickup", label: "Recogida" });
  if (!light && dropoff) markers.push({ id: "dropoff", lat: dropoff.lat, lng: dropoff.lng, kind: "dropoff", label: dropoff.address ? shortAddress(dropoff.address, 1) : "Destino" });
  if (gps && !usingGps) markers.push({ id: "me", lat: gps.lat, lng: gps.lng, kind: "me" });
  // Ruta real por calles cuando el motor respondió; línea recta (discontinua) mientras tanto o si se estimó.
  const polyline = pickup && !light && dropoff ? (quote && quote.geometry.length > 2 ? quote.geometry : [pickup, dropoff]) : undefined;

  const ctaLabel = !pickup
    ? "Marcar dónde estás"
    : !light && !dropoff
      ? "Elegir destino"
      : light
        ? `Pedir ${KIND_LABELS[kind]}`
        : `Pedir GrúaYa ${VEHICLE_SHORT[vehicle.vehicleKind]}`;
  const needsQuote = !!pickup && (light || !!dropoff);

  const footer = (
    <>
      {requestError && <Notice tone="danger">{requestError}</Notice>}
      <p className="chico flex items-center gap-2 text-muted">
        {included ? "✅ Incluido en tu membresía" : "💵 Pago en efectivo al piloto"}
        {ready && !included && <span>· {formatQ(total)}</span>}
      </p>
      <Button size="lg" fullWidth loading={requesting} disabled={needsQuote && !ready && !quoteError} onClick={create}>
        {needsQuote && !ready && !quoteError ? "Calculando precio…" : ctaLabel}
      </Button>
    </>
  );

  return (
    <ClientScreen
      section="pedir"
      hasActive={!!me.activeRequest}
      footer={footer}
      map={
        <MapView
          center={pickup ?? GUATEMALA_CITY}
          zoom={15}
          markers={markers}
          polyline={polyline}
          fitToMarkers={markers.length > 1}
          followCenter={markers.length <= 1}
          onPick={(p) => onDraftChange({ ...draft, pickup: p })}
          className="h-full w-full"
        />
      }
      extra={
        <Sheet open={vehicleOpen} onClose={() => setVehicleOpen(false)} title="Tu vehículo">
          <VehicleForm
            me={me}
            value={vehicle}
            onSave={(v) => {
              onVehicleChange(v);
              setVehicleOpen(false);
            }}
          />
        </Sheet>
      }
    >
      <RouteFields
        origin={{
          label: "Recogida · toca el mapa",
          value: pickup ? (usingGps ? "Tu ubicación actual" : (pickupLabel ?? "Punto marcado en el mapa")) : "Toca el mapa o busca la dirección",
          onClick: onEditPickup,
          action: (
            // span con rol de botón: la fila ya es un <button> y no se pueden anidar.
            <span
              role="button"
              tabIndex={gps ? 0 : -1}
              aria-disabled={!gps}
              className={cn("pildora !min-h-[36px] !px-3 !text-[13px]", !gps && "opacity-40")}
              onClick={(e) => {
                e.stopPropagation();
                if (gps) onDraftChange({ ...draft, pickup: null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (gps) onDraftChange({ ...draft, pickup: null });
                }
              }}
            >
              📍 Mi ubicación
            </span>
          ),
        }}
        destination={{
          label: "Destino",
          value: light ? "Asistencia en el lugar, sin destino" : dropoff ? shortAddress(dropoff.address ?? "Punto marcado en el mapa") : "¿A dónde llevamos tu vehículo?",
          onClick: light ? undefined : onEditDropoff,
          action: light ? undefined : (
            <span className="px-2 text-xl text-muted" aria-hidden>
              ⌄
            </span>
          ),
        }}
      />
      {gpsError && usingGps && <p className="tenue">{gpsError}. Toca el mapa o busca la dirección para marcar dónde estás.</p>}

      <div className="chips" role="group" aria-label="Qué pasó">
        {PROBLEM_CHIPS.map((c) => (
          <Chip key={c} active={problem === c} onClick={() => setProblem(problem === c ? null : c)}>
            {c}
          </Chip>
        ))}
      </div>
      {problem === "Otro" && (
        <Input placeholder="Cuéntanos qué pasó (opcional)" aria-label="Qué pasó" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      )}

      <div className="opciones" role="radiogroup" aria-label="Servicio">
        {VEHICLE_OPTIONS.map((o) => {
          const active = kind === "TOW" && vehicle.vehicleKind === o.kind;
          return (
            <OptionRow
              key={o.kind}
              className="!min-h-[60px]"
              icon={VEHICLE_ICONS[o.kind]}
              title={`GrúaYa ${o.name}`}
              subtitle={kind === "TOW" && needsQuote ? (ready ? (towEta ?? `Precio fijo · ${o.detail}`) : quoteError ? o.detail : "Calculando precio…") : o.detail}
              price={kind === "TOW" && ready ? formatQ(total) : `desde ${formatQ(TOW_BASE_Q)}`}
              active={active}
              onClick={() => setKind("TOW", o.kind)}
            />
          );
        })}
      </div>

      <p className="tenue">Asistencia ligera · {me.isMember ? "incluida en tu membresía" : `${formatQ(LIGHT_NON_MEMBER_Q)} por servicio`}</p>
      <div className="opciones -mt-2" role="radiogroup" aria-label="Asistencia ligera">
        {SERVICE_ORDER.filter((k) => k !== "TOW").map((k) => (
          <OptionRow
            key={k}
            className="!min-h-[56px]"
            icon={<span className="text-2xl">{KIND_ICONS[k]}</span>}
            title={KIND_LABELS[k]}
            subtitle={KIND_HINTS[k]}
            price={me.isMember ? "Incluido" : formatQ(LIGHT_NON_MEMBER_Q)}
            active={kind === k}
            onClick={() => setKind(k)}
          />
        ))}
      </div>

      <button type="button" onClick={() => setVehicleOpen(true)} className="flex min-h-11 items-center gap-2 text-left text-sm">
        <span aria-hidden>{VEHICLE_ICONS[vehicle.vehicleKind]}</span>
        <span className="min-w-0 flex-1 truncate text-muted">
          Tu vehículo: {[VEHICLE_LABELS[vehicle.vehicleKind], vehicle.vehicleLabel, vehicle.plate].filter(Boolean).join(" · ")}
        </span>
        <span className="font-bold">Cambiar</span>
      </button>

      {quoteError && (
        <Notice tone="danger" className="flex items-center justify-between gap-3">
          <span>{quoteError}</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => setAttempt((a) => a + 1)}
          >
            Reintentar
          </button>
        </Notice>
      )}

      {quote && (
        <details className="chico text-muted">
          <summary className="cursor-pointer select-none">
            Precio fijo
            {kind === "TOW" && ` · ${formatKm(quote.distanceKm)} y ${quote.towMinutes < 1 ? "menos de 1 min" : `unos ${formatMinutes(quote.towMinutes)}`}${approx}`}
            {light && ` · ${quote.quote.summary}`}
          </summary>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {quote.quote.lines.map((l) => (
              <span key={l.label} className="flex justify-between gap-3">
                <span>{l.label}</span>
                <span className="tabular-nums">{formatQ(l.amountQ)}</span>
              </span>
            ))}
            <span className="flex justify-between gap-3 font-bold text-foreground">
              <span>Total</span>
              <span className="tabular-nums">{included ? "Incluido" : formatQ(total)}</span>
            </span>
          </div>
        </details>
      )}
      {quote && kind === "TOW" && quote.distanceKm < 0.05 && (
        <Aviso>El destino está en el mismo punto que la recogida. Si quieres que llevemos tu vehículo a otro lugar, toca Destino.</Aviso>
      )}
      {quote && !isMember && (
        <Aviso>Hazte socio: {kind === "TOW" ? `ahorras ${formatQ(NON_MEMBER_TOW_FEE_Q)} en cada grúa` : "esta asistencia iría incluida"} y las asistencias ligeras van sin costo.</Aviso>
      )}
    </ClientScreen>
  );
}

function VehicleForm({ me, value, onSave }: { me: ClientSelf; value: VehicleDraft; onSave: (v: VehicleDraft) => void }) {
  const [draft, setDraft] = useState<VehicleDraft>(value);
  return (
    <div className="grid gap-3">
      {me.vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {me.vehicles.map((v) => {
            const selected = draft.plate === v.plate && draft.vehicleKind === v.kind;
            return (
              <Chip key={v.id} active={selected} onClick={() => setDraft({ vehicleKind: v.kind, vehicleLabel: v.label, plate: v.plate })}>
                {VEHICLE_ICONS[v.kind]} {v.label} · {v.plate}
              </Chip>
            );
          })}
        </div>
      )}
      <Field label="Vehículo">
        <Select value={draft.vehicleKind} onChange={(e) => setDraft({ ...draft, vehicleKind: e.target.value as VehicleKind })}>
          {(Object.keys(VEHICLE_LABELS) as VehicleKind[]).map((k) => (
            <option key={k} value={k}>
              {VEHICLE_ICONS[k]} {VEHICLE_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Marca y color" hint="Ayuda al piloto a reconocerte">
        <Input value={draft.vehicleLabel} onChange={(e) => setDraft({ ...draft, vehicleLabel: e.target.value })} placeholder="Toyota Corolla gris" maxLength={80} />
      </Field>
      <Field label="Placa de tu vehículo (opcional)">
        <Input value={draft.plate} onChange={(e) => setDraft({ ...draft, plate: e.target.value.toUpperCase() })} placeholder="P-123ABC" maxLength={12} className={cn("uppercase")} />
      </Field>
      <Button size="lg" fullWidth onClick={() => onSave({ ...draft, vehicleLabel: draft.vehicleLabel.trim(), plate: draft.plate.trim() })}>
        Guardar
      </Button>
    </div>
  );
}
