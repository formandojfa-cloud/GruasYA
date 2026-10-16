"use client";

/**
 * Mapa con Leaflet + OpenStreetMap. Solo se importa en cliente (ver Map.tsx).
 * Los marcadores son SVG inline (divIcon) para no depender de imágenes.
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

function pinSvg(fill: string, glyph: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
    <path d="M18 45c-1-7-16-17-16-27A16 16 0 0 1 34 18c0 10-15 20-16 27z" fill="${fill}" stroke="#fff" stroke-width="2"/>
    <text x="18" y="24" text-anchor="middle" font-size="16" font-family="system-ui">${glyph}</text>
  </svg>`;
}

function vehicleSvg(kind: "provider" | "provider-idle" | "provider-busy", heading: number | null | undefined, glyph: string): string {
  const color = kind === "provider-idle" ? "#06c167" : kind === "provider-busy" ? "#5e5e5e" : "#000";
  const rot = heading ?? 0;
  return `<div style="position:relative;width:44px;height:44px">
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" style="transform:rotate(${rot}deg)">
      <path d="M22 4l6 10h-12z" fill="${color}" opacity="${heading == null ? 0 : 1}"/>
    </svg>
    <div style="position:absolute;inset:8px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.3)">${glyph}</div>
  </div>`;
}

function iconFor(m: MapMarker): L.DivIcon {
  switch (m.kind) {
    case "pickup":
      return L.divIcon({ html: pinSvg("#000", "📍"), iconSize: [36, 46], iconAnchor: [18, 45], className: "" });
    case "dropoff":
      return L.divIcon({ html: pinSvg("#276ef1", "🏁"), iconSize: [36, 46], iconAnchor: [18, 45], className: "" });
    case "me":
      return L.divIcon({
        html: `<div style="position:relative;width:24px;height:24px"><div class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:#276ef1;opacity:.4"></div><div style="position:absolute;inset:5px;border-radius:50%;background:#276ef1;border:2px solid #fff;box-shadow:0 0 0 2px rgba(39,110,241,.3)"></div></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        className: "",
      });
    case "provider":
    case "provider-idle":
    case "provider-busy":
      return L.divIcon({ html: vehicleSvg(m.kind, m.heading, m.glyph ?? "🚛"), iconSize: [44, 44], iconAnchor: [22, 22], className: "" });
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
            <Tooltip direction="top" offset={[0, m.kind === "pickup" || m.kind === "dropoff" ? -44 : -20]} opacity={0.95}>
              {m.label}
            </Tooltip>
          )}
        </Marker>
      ))}
      {polyline && polyline.length > 1 && (
        <Polyline positions={polyline.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: "#000", weight: 4, opacity: 0.8, dashArray: "1 8", lineCap: "round" }} />
      )}
      <FitBounds points={points} enabled={fitToMarkers} />
      {followCenter && <Recenter center={center} zoom={zoom} />}
      <Events onPick={onPick} onMoveEnd={onMoveEnd} />
      {children}
    </MapContainer>
  );
}
