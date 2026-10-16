"use client";

import { useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { Aviso, Button, Notice, Spinner } from "@/components/ui";
import { DEFAULT_CENTER } from "@/lib/config";
import { PROVIDER_STATUS_LABELS, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ProviderSelf } from "@/lib/types";
import { NumbersCard, ProfileCard } from "./bits";
import type { LocationReporter } from "./useLocationReporter";

/**
 * Pantalla principal: tarjeta con nombre/placa/calificación y el botón
 * Disponible / No disponible, tarjeta de espera, mapa con mi posición en una
 * tarjeta de 300 px y "Tus números".
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
  const shown = loc.position ?? (self.location ? { lat: self.location.lat, lng: self.location.lng, heading: self.location.heading } : null);
  const center = shown ?? DEFAULT_CENTER;
  const markers: MapMarker[] = shown ? [{ id: "me", lat: shown.lat, lng: shown.lng, kind: "me", label: "Tú" }] : [];

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

  return (
    <>
      <ProfileCard
        self={self}
        action={
          <Button
            variant={online ? "primary" : "secondary"}
            loading={busy}
            onClick={toggle}
            disabled={self.status === "BUSY"}
            aria-pressed={online}
            className="shrink-0"
          >
            {PROVIDER_STATUS_LABELS[self.status]}
          </Button>
        }
      />

      {notice && (
        <div role="status" className="aviso">
          {notice}
        </div>
      )}

      <section className="tarjeta" aria-live="polite">
        <div className="flex items-center gap-3">
          {online && <Spinner size="sm" className="text-muted" />}
          {online ? (
            <p className="tenue text-[16px]">Esperando solicitudes cercanas…</p>
          ) : self.status === "BUSY" ? (
            <p className="tenue text-[16px]">Tienes un servicio en curso.</p>
          ) : (
            <p className="tenue text-[16px]">Actívate para recibir solicitudes.</p>
          )}
        </div>

        {online && !loc.position && (
          <Aviso className="flex flex-col gap-2">
            <span>
              <strong>{loc.geoError ?? "Obteniendo tu ubicación…"}</strong> Sin ubicación no recibirás solicitudes. Puedes fijarla tocando el mapa.
            </span>
            <Button size="sm" variant="primary" onClick={() => setPicking(true)}>
              Fijar mi ubicación
            </Button>
          </Aviso>
        )}

        {online && loc.position && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              {loc.source === "manual" ? "📌 Ubicación fijada a mano" : "📡 GPS en vivo"}
              {loc.lastSentAt ? ` · enviada ${relativeTime(new Date(loc.lastSentAt), now)}` : ""}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
              {loc.source === "manual" ? "Mover" : "Fijar mi ubicación"}
            </Button>
            {loc.source === "manual" && loc.gpsPosition && (
              <Button size="sm" variant="ghost" onClick={() => loc.setManual(null)}>
                Usar GPS
              </Button>
            )}
          </div>
        )}

        {online && loc.sendError && <Notice tone="danger">{loc.sendError}</Notice>}
        {actionError && <Notice tone="danger">{actionError}</Notice>}
      </section>

      <section className="tarjeta" aria-label="Mapa">
        {picking && (
          <Aviso className="flex items-center gap-2">
            <span className="flex-1 font-semibold">Toca el mapa en el lugar donde estás</span>
            <button type="button" onClick={() => setPicking(false)} className="h-9 rounded-lg px-2 text-sm font-bold underline">
              Cancelar
            </button>
          </Aviso>
        )}
        <div className="mapa-marco">
          <MapView
            className="h-full w-full"
            center={center}
            zoom={15}
            markers={markers}
            followCenter={!picking}
            onPick={picking ? (p) => {
              loc.setManual(p);
              setPicking(false);
            } : undefined}
          />
        </div>
      </section>

      <NumbersCard today={self.today} />

      {!online && self.status !== "BUSY" && (
        <button type="button" onClick={() => void onLogout()} className="mx-auto h-10 px-3 text-sm text-muted underline">
          Salir de esta cuenta
        </button>
      )}
    </>
  );
}
