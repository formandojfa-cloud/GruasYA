"use client";

/** Inicio "Hola, {nombre}": mapa con tu ubicación, qué necesitas (grúa o asistencia ligera) y tu vehículo. */
import { useState } from "react";
import MapView, { type MapMarker } from "@/components/map/Map";
import { Aviso, Button, Field, Input, Select, Sheet, cn } from "@/components/ui";
import { formatQ, KIND_ICONS, KIND_LABELS, VEHICLE_LABELS } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import type { ClientSelf, ServiceKind, VehicleKind } from "@/lib/types";
import { ClientShell } from "./ClientShell";
import { GUATEMALA_CITY, KIND_HINTS, LIGHT_NON_MEMBER_Q, SERVICE_ORDER, TOW_BASE_Q, VEHICLE_ICONS } from "./constants";
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
  const light = SERVICE_ORDER.filter((k) => k !== "TOW");

  return (
    <ClientShell section="pedir">
      <section className="tarjeta">
        <h2>Hola, {firstName}</h2>
        <p className="tenue">{me.isMember ? "Tus asistencias ligeras están incluidas en tu membresía." : "Pides, ves el precio fijo y pagas en efectivo al gruero."}</p>
        {gpsError && <Aviso>{gpsError}. Mostramos Ciudad de Guatemala; en el siguiente paso puedes mover el mapa.</Aviso>}
      </section>

      <div className="mapa-marco">
        <MapView center={center} zoom={15} followCenter markers={markers} className="h-full w-full" />
      </div>

      <section className="tarjeta">
        <h3>¿Qué necesitas?</h3>
        <ServiceTile kind="TOW" isMember={me.isMember} onClick={() => onPick("TOW")} />
        <p className="tenue">Asistencia ligera · {me.isMember ? "incluida en tu membresía" : `${formatQ(LIGHT_NON_MEMBER_Q)} por servicio`}</p>
        <div className="grid grid-cols-2 gap-2">
          {light.map((kind) => (
            <ServiceTile key={kind} kind={kind} isMember={me.isMember} onClick={() => onPick(kind)} />
          ))}
        </div>
      </section>

      <section className="tarjeta">
        <h3>Tu vehículo</h3>
        <button
          type="button"
          onClick={() => setVehicleOpen(true)}
          className="flex w-full items-center gap-3 rounded-[10px] bg-surface px-3 py-3 text-left hover:bg-surface-2"
          aria-label="Cambiar vehículo"
        >
          <span className="text-2xl leading-none" aria-hidden>
            {VEHICLE_ICONS[vehicle.vehicleKind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {VEHICLE_LABELS[vehicle.vehicleKind]}
              {vehicle.vehicleLabel && ` · ${vehicle.vehicleLabel}`}
            </span>
            <span className="block text-sm text-muted">{vehicle.plate ? `Placa ${vehicle.plate}` : "Agrega la placa (opcional)"}</span>
          </span>
          <span className="text-sm font-bold">Cambiar</span>
        </button>
      </section>

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
    </ClientShell>
  );
}

function ServiceTile({ kind, isMember, onClick }: { kind: ServiceKind; isMember: boolean; onClick: () => void }) {
  const tow = kind === "TOW";
  const price = tow ? `desde ${formatQ(TOW_BASE_Q)}` : isMember ? "Incluido" : formatQ(LIGHT_NON_MEMBER_Q);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border text-left transition active:scale-[0.98]",
        tow
          ? "flex min-h-[72px] items-center gap-3 border-amarillo bg-amarillo p-3 text-primary-foreground hover:brightness-95"
          : "flex min-h-[88px] flex-col justify-between gap-2 border-border bg-surface p-3 hover:bg-surface-2",
      )}
    >
      <span className={cn("leading-none", tow ? "text-4xl" : "text-2xl")} aria-hidden>
        {KIND_ICONS[kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-bold leading-tight", tow ? "text-[17px]" : "text-[15px]")}>{tow ? "Pedir grúa" : KIND_LABELS[kind]}</span>
        <span className={cn("block text-xs", tow ? "opacity-80" : "text-muted")}>{tow ? KIND_HINTS[kind] : price}</span>
      </span>
      {tow && <span className="whitespace-nowrap text-sm font-bold">{price}</span>}
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
                className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", selected ? "border-tinta bg-tinta text-tarjeta" : "border-border bg-background")}
              >
                {VEHICLE_ICONS[v.kind]} {v.label} · {v.plate}
              </button>
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
      <Field label="Marca y color" hint="Ayuda al gruero a reconocerte">
        <Input value={draft.vehicleLabel} onChange={(e) => setDraft({ ...draft, vehicleLabel: e.target.value })} placeholder="Toyota Corolla gris" maxLength={80} />
      </Field>
      <Field label="Placa de tu vehículo (opcional)">
        <Input value={draft.plate} onChange={(e) => setDraft({ ...draft, plate: e.target.value.toUpperCase() })} placeholder="P-123ABC" maxLength={12} className="uppercase" />
      </Field>
      <Button size="lg" fullWidth onClick={() => onSave({ ...draft, vehicleLabel: draft.vehicleLabel.trim(), plate: draft.plate.trim() })}>
        Guardar
      </Button>
    </div>
  );
}
