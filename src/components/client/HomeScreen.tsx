"use client";

/** Inicio "¿Qué necesitas?": mapa con tu ubicación, servicios y vehículo. */
import Link from "next/link";
import { useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Button, Field, Input, Notice, Select, Sheet, cn } from "@/components/ui";
import { formatQ, KIND_ICONS, KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { ClientSelf, ServiceKind, VehicleKind } from "@/lib/types";
import { GUATEMALA_CITY, KIND_HINTS, LIGHT_NON_MEMBER_Q, SERVICE_ORDER, TOW_BASE_Q, VEHICLE_ICONS } from "./constants";
import { MapScreen } from "./MapScreen";
import { MemberBadge } from "./session";
import type { VehicleDraft } from "./useVehicle";

type Props = {
  me: ClientSelf;
  gps: LatLng | null;
  gpsError: string | null;
  vehicle: VehicleDraft;
  onVehicleChange: (v: VehicleDraft) => void;
  onPick: (kind: ServiceKind) => void;
};

export function HomeScreen({ me, gps, gpsError, vehicle, onVehicleChange, onPick }: Props) {
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const center = gps ?? GUATEMALA_CITY;
  const markers: MapMarker[] = gps ? [{ id: "me", lat: gps.lat, lng: gps.lng, kind: "me" }] : [];
  const firstName = me.name.split(" ")[0];

  return (
    <MapScreen
      mapClassName="h-[44dvh]"
      map={<MapView center={center} zoom={15} followCenter markers={markers} className="h-full w-full" />}
      top={
        <header className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 rounded-full bg-background px-3 py-2 shadow-md">
            <span className="truncate text-sm font-bold">🚛 Asistencia Vial</span>
            <MemberBadge isMember={me.isMember} />
          </div>
          <nav className="flex gap-2" aria-label="Secciones">
            <Link href="/historial" aria-label="Historial" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-background text-xl shadow-md hover:bg-surface">
              🕘
            </Link>
            <Link href="/cuenta" aria-label="Cuenta" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-background text-xl shadow-md hover:bg-surface">
              👤
            </Link>
          </nav>
        </header>
      }
    >
      <>
        <h1 className="text-2xl font-bold">¿Qué necesitas?</h1>
        <p className="text-sm text-muted">
          Hola, {firstName}. {me.isMember ? "Tus asistencias ligeras están incluidas." : "Pides, ves el precio y pagas al terminar."}
        </p>
        {gpsError && (
          <Notice tone="warning" className="mt-2 text-xs">
            {gpsError}. Mostramos Ciudad de Guatemala; en el siguiente paso puedes mover el pin.
          </Notice>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SERVICE_ORDER.map((kind) => (
            <ServiceTile key={kind} kind={kind} isMember={me.isMember} onClick={() => onPick(kind)} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVehicleOpen(true)}
          className="mt-3 flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-3 text-left hover:bg-surface-2"
          aria-label="Cambiar vehículo"
        >
          <span className="text-2xl leading-none" aria-hidden>
            {VEHICLE_ICONS[vehicle.vehicleKind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {VEHICLE_LABELS[vehicle.vehicleKind]}
              {vehicle.vehicleLabel && ` · ${vehicle.vehicleLabel}`}
            </span>
            <span className="block text-xs text-muted">{vehicle.plate ? `Placa ${vehicle.plate}` : "Agrega la placa (opcional)"}</span>
          </span>
          <span className="text-sm font-semibold">Cambiar</span>
        </button>

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
      </>
    </MapScreen>
  );
}

function ServiceTile({ kind, isMember, onClick }: { kind: ServiceKind; isMember: boolean; onClick: () => void }) {
  const tow = kind === "TOW";
  const price = tow ? `desde ${formatQ(TOW_BASE_Q)}` : isMember ? "Incluido en tu membresía" : formatQ(LIGHT_NON_MEMBER_Q);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-left transition active:scale-[0.98]",
        tow ? "col-span-2 flex min-h-20 items-center gap-3 border-primary bg-primary text-primary-foreground" : "flex min-h-24 flex-col justify-between gap-2 border-border bg-surface hover:bg-surface-2",
      )}
    >
      <span className={cn("leading-none", tow ? "text-4xl" : "text-3xl")} aria-hidden>
        {KIND_ICONS[kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-tight">{KIND_LABELS[kind]}</span>
        <span className={cn("block text-xs", tow ? "opacity-80" : "text-muted")}>{tow ? KIND_HINTS[kind] : price}</span>
      </span>
      {tow && <span className="whitespace-nowrap text-sm font-semibold">{price}</span>}
    </button>
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
              <button
                key={v.id}
                type="button"
                onClick={() => setDraft({ vehicleKind: v.kind, vehicleLabel: v.label, plate: v.plate })}
                className={cn("rounded-full border px-3 py-2 text-sm font-semibold", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")}
              >
                {VEHICLE_ICONS[v.kind]} {v.label} · {v.plate}
              </button>
            );
          })}
        </div>
      )}
      <Field label="Tipo de vehículo">
        <Select value={draft.vehicleKind} onChange={(e) => setDraft({ ...draft, vehicleKind: e.target.value as VehicleKind })}>
          {(Object.keys(VEHICLE_LABELS) as VehicleKind[]).map((k) => (
            <option key={k} value={k}>
              {VEHICLE_ICONS[k]} {VEHICLE_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Marca y color" hint="Ayuda al gruero a reconocerte">
        <Input value={draft.vehicleLabel} onChange={(e) => setDraft({ ...draft, vehicleLabel: e.target.value })} placeholder="Toyota Corolla gris" maxLength={80} />
      </Field>
      <Field label="Placa (opcional)">
        <Input value={draft.plate} onChange={(e) => setDraft({ ...draft, plate: e.target.value.toUpperCase() })} placeholder="P123ABC" maxLength={12} className="uppercase" />
      </Field>
      <Button size="lg" fullWidth onClick={() => onSave({ ...draft, vehicleLabel: draft.vehicleLabel.trim(), plate: draft.plate.trim() })}>
        Guardar
      </Button>
    </div>
  );
}
