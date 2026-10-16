"use client";

import Link from "next/link";
import { useState } from "react";
import MapView from "@/components/map/Map";
import type { MapMarker } from "@/components/map/types";
import { Button, Notice, Pill, Spinner } from "@/components/ui";
import { DEFAULT_CENTER } from "@/lib/config";
import { formatQ, PROVIDER_KIND_LABELS, PROVIDER_STATUS_LABELS, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ProviderSelf } from "@/lib/types";
import { Avatar, DriverPanel, StatTile } from "./bits";
import type { LocationReporter } from "./useLocationReporter";
import { initialOf } from "./util";

/**
 * Pantalla principal: mapa con mi posición, encabezado con nombre/vehículo/
 * calificación, ganancias del día y el botón grande Conectarse/Desconectarse.
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

  const ratingText = self.rating != null ? `★ ${self.rating.toFixed(1)} (${self.ratingCount})` : "Sin calificaciones aún";
  const vehicleText = [PROVIDER_KIND_LABELS[self.kind], self.vehicleLabel, self.plate].filter(Boolean).join(" · ");
  const statusTone = self.status === "ONLINE" ? "success" : self.status === "BUSY" ? "info" : "neutral";

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1">
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

      {/* Encabezado flotante */}
      <header className="absolute inset-x-0 top-0 z-20 p-3 safe-top">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-md backdrop-blur">
          <Avatar initial={initialOf(self.name)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold">{self.name}</h1>
              <Pill tone={statusTone}>{PROVIDER_STATUS_LABELS[self.status]}</Pill>
            </div>
            <p className="truncate text-xs text-muted">{vehicleText}</p>
            <p className="text-xs text-muted">{ratingText}</p>
          </div>
          <Link href="/driver/historial" className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl hover:bg-surface" aria-label="Historial">
            <span aria-hidden className="text-lg leading-none">
              🧾
            </span>
            <span className="mt-0.5 text-[10px] font-semibold">Historial</span>
          </Link>
        </div>
        {picking && (
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-md">
            <span className="flex-1 text-sm font-semibold">Toca el mapa en el lugar donde estás</span>
            <button type="button" onClick={() => setPicking(false)} className="rounded-lg px-2 py-1 text-sm underline">
              Cancelar
            </button>
          </div>
        )}
      </header>
      </div>

      {!picking && (
        <DriverPanel className="flex flex-col gap-3">
          {notice && <Notice tone="info">{notice}</Notice>}

          <div className="flex items-center gap-3 px-1">
            {online ? (
              <>
                <Spinner size="sm" className="text-success" />
                <p className="text-base font-semibold">Esperando servicios cerca de ti…</p>
              </>
            ) : self.status === "BUSY" ? (
              <p className="text-base font-semibold">Tienes un servicio en curso.</p>
            ) : (
              <p className="text-base font-semibold text-muted">Estás desconectado. Conéctate para recibir servicios.</p>
            )}
          </div>

          {online && !loc.position && (
            <Notice tone="warning" className="flex flex-col gap-2">
              <span>
                <strong>{loc.geoError ?? "Obteniendo tu ubicación…"}</strong> Sin ubicación no recibirás servicios. Puedes fijarla tocando el mapa.
              </span>
              <Button size="sm" variant="primary" onClick={() => setPicking(true)}>
                Fijar mi ubicación
              </Button>
            </Notice>
          )}

          {online && loc.position && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                {loc.source === "manual" ? "📌 Ubicación fijada a mano" : "📡 GPS activo"}
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

          <div className="flex gap-3">
            <StatTile label="Servicios hoy" value={self.today.jobs} />
            <StatTile label="Ganado hoy" value={formatQ(self.today.earningsQ)} />
          </div>

          <Button size="lg" fullWidth variant={online ? "secondary" : "primary"} loading={busy} onClick={toggle} disabled={self.status === "BUSY"}>
            {online ? "Desconectarse" : "Conectarse"}
          </Button>

          {!online && self.status !== "BUSY" && (
            <button type="button" onClick={() => void onLogout()} className="mx-auto h-10 px-3 text-xs text-muted underline">
              Salir de esta cuenta
            </button>
          )}
        </DriverPanel>
      )}
    </main>
  );
}
