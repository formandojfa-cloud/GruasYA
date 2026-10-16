"use client";

/**
 * Mapa con Leaflet + OpenStreetMap. Solo se importa en cliente (ver Map.tsx).
 * Los marcadores son divIcon con las clases .pin del prototipo (sin imágenes).
 * La ruta se dibuja azul: sólida cuando viene por calles (>2 puntos), punteada si es línea recta.
 */
import L, { type LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { DEFAULT_CENTER } from "@/lib/config";
import type { LatLng } from "@/lib/geo";
import type { MapMarker, MapProps } from "./types";

const TILE_URL = process.env.NEXT_PUBLIC_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Pin del prototipo: círculo blanco de 34 px con emoji (clases .pin* en globals.css). */
function pinHtml(cls: string, glyph: string): string {
  return `<div class="pin ${cls}">${glyph}</div>`;
}

const RING: Record<"provider" | "provider-idle" | "provider-busy", { cls: string; color: string }> = {
  provider: { cls: "pin-grua", color: "#f5b301" },
  "provider-idle": { cls: "pin-grua-libre", color: "#1f8a4c" },
  "provider-busy": { cls: "pin-grua-ocupada", color: "#2f6fd1" },
};

function vehicleHtml(kind: keyof typeof RING, heading: number | null | undefined, glyph: string): string {
  const { cls, color } = RING[kind];
  const arrow =
    heading == null
      ? ""
      : `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(${heading}deg)"><path d="M22 1l6 10h-12z" fill="${color}"/></svg>`;
  return `<div class="pin-marco">${arrow}${pinHtml(cls, glyph)}</div>`;
}

function iconFor(m: MapMarker): L.DivIcon {
  switch (m.kind) {
    case "pickup":
      return L.divIcon({ html: pinHtml("pin-origen", "🚗"), iconSize: [34, 34], iconAnchor: [17, 17], className: "" });
    case "dropoff":
      return L.divIcon({ html: pinHtml("pin-destino", "🏁"), iconSize: [34, 34], iconAnchor: [17, 17], className: "" });
    case "me":
      return L.divIcon({
        html: `<div style="position:relative;width:24px;height:24px"><div class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:#2f6fd1;opacity:.4"></div><div style="position:absolute;inset:5px;border-radius:50%;background:#2f6fd1;border:2px solid #fff;box-shadow:0 0 0 2px rgba(47,111,209,.3)"></div></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        className: "",
      });
    case "provider":
    case "provider-idle":
    case "provider-busy":
      return L.divIcon({ html: vehicleHtml(m.kind, m.heading, m.glyph ?? "🚚"), iconSize: [44, 44], iconAnchor: [22, 22], className: "" });
  }
}

function FitBounds({ points, enabled }: { points: LatLng[]; enabled: boolean }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (!enabled || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], Math.max(map.getZoom(), 15), { animate: true });
      return;
    }
    const bounds: LatLngBoundsExpression = points.map((p) => [p.lat, p.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return null;
}

function Events({ onPick, onMoveEnd }: Pick<MapProps, "onPick" | "onMoveEnd">) {
  useMapEvents({
    click(e) {
      onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    moveend(e) {
      const c = e.target.getCenter();
      onMoveEnd?.({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

function Recenter({ center, zoom }: { center?: LatLng; zoom?: number }) {
  const map = useMap();
  const last = useRef<string>("");
  useEffect(() => {
    if (!center) return;
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${zoom ?? ""}`;
    if (key === last.current) return;
    last.current = key;
    map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: true });
  }, [center, zoom, map]);
  return null;
}

export default function LeafletMap({
  center,
  zoom = 14,
  markers = [],
  polyline,
  fitToMarkers = false,
  followCenter = false,
  onPick,
  onMoveEnd,
  className,
  interactive = true,
  children,
}: MapProps) {
  const initial = center ?? DEFAULT_CENTER;
  const points = useMemo(() => markers.map((m) => ({ lat: m.lat, lng: m.lng })), [markers]);
  return (
    <MapContainer
      center={[initial.lat, initial.lng]}
      zoom={zoom}
      className={className ?? "h-full w-full"}
      zoomControl={false}
      attributionControl
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={iconFor(m)} zIndexOffset={m.kind.startsWith("provider") ? 500 : 0}>
          {m.label && (
            <Tooltip direction="top" className="pin-etiqueta" offset={[0, m.kind.startsWith("provider") ? -24 : -20]} opacity={1}>
              {m.label}
            </Tooltip>
          )}
        </Marker>
      ))}
      {polyline && polyline.length > 1 && (
        <Polyline
          positions={polyline.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={
            polyline.length > 2
              ? { color: "#2f6fd1", weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round" }
              : { color: "#2f6fd1", weight: 4, opacity: 0.8, dashArray: "1 10", lineCap: "round" }
          }
        />
      )}
      <FitBounds points={points} enabled={fitToMarkers} />
      {followCenter && <Recenter center={center} zoom={zoom} />}
      <Events onPick={onPick} onMoveEnd={onMoveEnd} />
      {children}
    </MapContainer>
  );
}
