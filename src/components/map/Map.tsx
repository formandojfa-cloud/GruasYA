"use client";

import dynamic from "next/dynamic";
import type { MapProps } from "./types";

export type { MapMarker, MapMarkerKind, MapProps } from "./types";

/**
 * Mapa listo para usar en cualquier pantalla. Leaflet necesita `window`, así
 * que se carga solo en el navegador.
 *
 *   <Map className="h-full w-full" markers={[{ id: "p", lat, lng, kind: "pickup" }]} fitToMarkers />
 */
const Map = dynamic<MapProps>(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" aria-label="Cargando mapa" />,
});

export default Map;
