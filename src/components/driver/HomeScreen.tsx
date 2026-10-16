"use client";

import { useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { BottomPanel, Button, Notice, ProgressBar } from "@/components/ui";
import { DEFAULT_CENTER, DISPATCH } from "@/lib/config";
import { relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ProviderSelf } from "@/lib/types";
import { GpsPill, MapOverlay, MapScreen, NumbersRows, ProviderCard, providerGlyph } from "./bits";
import type { LocationReporter } from "./useLocationReporter";

/**
 * Pantalla principal: mapa completo con mi posición, píldora de GPS y hoja
 * inferior "Estás en línea / Estás desconectado" con la tarjeta del piloto,
 * los números de hoy y el botón Conectarme / Desconectarme.
 */
export default function HomeScreen({
  self,
  loc,
  notice,
  onToggle,
  onLogout,
}: {
  self: ProviderSelf;
  loc: LocationReporter;
  notice: string | null;
  onToggle: (to: "ONLINE" | "OFFLINE") => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const now = useNow(1000);

  const online = self.status === "ONLINE";
  const reporting = self.status !== "OFFLINE";
  const shown =
    loc.position ??
    (self.location
      ? {
          lat: self.location.lat,
          lng: self.location.lng,
          heading: self.location.heading,
        }
      : null);
  const center = shown ?? DEFAULT_CENTER;
  const markers: MapMarker[] = shown
    ? [
        {
          id: "me",
          lat: shown.lat,
          lng: shown.lng,
          kind: "provider",
          heading: shown.heading,
          glyph: providerGlyph(self.kind),
          label: "Tú",
        },
      ]
    : [];

  const toggle = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await onToggle(online ? "OFFLINE" : "ONLINE");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "No se pudo cambiar tu estado");
    } finally {
      setBusy(false);
    }
  };

  const map = (
    <MapView
      className="h-full w-full"
      center={center}
      zoom={15}
      markers={markers}
      followCenter={!picking}
      onPick={
        picking
          ? (p) => {
              loc.setManual(p);
              setPicking(false);
            }
          : undefined
      }
    />
  );

  const overlay = (
    <MapOverlay>
      <GpsPill loc={loc} reporting={reporting} />
      {notice && (
        <div role="status" className="mapa-aviso !static !left-auto !right-auto !top-auto w-full">
          {notice}
        </div>
      )}
      {picking && (
        <div className="mapa-aviso !static !left-auto !right-auto !top-auto flex w-full items-center gap-2">
          <span className="flex-1 font-semibold">Toca el mapa en el lugar donde estás</span>
          <button type="button" onClick={() => setPicking(false)} className="h-9 rounded-lg px-2 text-sm font-bold underline">
            Cancelar
          </button>
        </div>
      )}
    </MapOverlay>
  );

  const footer = (
    <>
      <Button variant={online ? "secondary" : "primary"} size="lg" fullWidth loading={busy} onClick={toggle} disabled={self.status === "BUSY"} aria-pressed={online}>
        {online ? "Desconectarme" : self.status === "BUSY" ? "En servicio" : "Conectarme"}
      </Button>
      {!online && self.status !== "BUSY" && (
        <button type="button" onClick={() => void onLogout()} className="mx-auto h-9 px-3 text-sm text-muted underline">
          Salir de esta cuenta
        </button>
      )}
    </>
  );

  return (
    <MapScreen map={map} overlay={overlay}>
      <BottomPanel footer={footer} className={picking ? "corta" : undefined}>
        <div className="flex items-start justify-between gap-3" aria-live="polite">
          <div className="min-w-0">
            <h2 className="titulo-hoja">{online ? "Estás en línea" : self.status === "BUSY" ? "En servicio" : "Estás desconectado"}</h2>
            <p className="tenue mt-1 text-[16px]">{online ? "Buscando solicitudes cerca de ti" : self.status === "BUSY" ? "Tienes un servicio en curso." : "Conéctate para recibir solicitudes"}</p>
          </div>
          <span className={`estado-punto mt-3 ${online ? "en-linea" : ""}`} aria-hidden />
        </div>

        {online && <ProgressBar label="Buscando solicitudes" />}

        {online && !loc.position && (
          <div className="aviso flex flex-col gap-2">
            <span>
              <strong>{loc.geoError ?? "Obteniendo tu ubicación…"}</strong> Sin ubicación no recibirás solicitudes. Puedes fijarla tocando el mapa.
            </span>
            <Button size="sm" variant="primary" onClick={() => setPicking(true)} className="self-start">
              Fijar mi ubicación
            </Button>
          </div>
        )}

        {online && loc.position && (
          <>
            <p className="tenue chico">
              {loc.source === "manual" ? "Tu ubicación está fijada a mano." : "Tu ubicación se actualiza en vivo."} Solo te llegan solicitudes a {DISPATCH.searchRadiusKm} km o menos de donde estás.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{loc.lastSentAt ? `Enviada ${relativeTime(new Date(loc.lastSentAt), now)}` : "Enviando…"}</span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
                {loc.source === "manual" ? "Mover" : "Fijar a mano"}
              </Button>
              {loc.source === "manual" && loc.gpsPosition && (
                <Button size="sm" variant="ghost" onClick={() => loc.setManual(null)}>
                  Usar GPS
                </Button>
              )}
            </div>
          </>
        )}

        {online && loc.sendError && <Notice tone="danger">{loc.sendError}</Notice>}
        {actionError && <Notice tone="danger">{actionError}</Notice>}

        <div className="separador" />

        <ProviderCard self={self} />
        <NumbersRows today={self.today} />
      </BottomPanel>
    </MapScreen>
  );
}
