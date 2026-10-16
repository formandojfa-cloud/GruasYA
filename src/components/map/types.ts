import type { ReactNode } from "react";
import type { LatLng } from "@/lib/geo";

export type MapMarkerKind = "pickup" | "dropoff" | "me" | "provider" | "provider-idle" | "provider-busy";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  kind: MapMarkerKind;
  label?: string;
  /** Grados (0 = norte); dibuja la flecha de rumbo en proveedores. */
  heading?: number | null;
  /** Emoji del vehículo: 🚛 grúa, 🏍️ moto. */
  glyph?: string;
};

export type MapProps = {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** Línea discontinua entre puntos (p. ej. recogida → destino). */
  polyline?: LatLng[];
  /** Ajusta el encuadre a todos los marcadores cuando cambian. */
  fitToMarkers?: boolean;
  /** Mueve la vista cuando cambia `center` (p. ej. seguir al usuario). */
  followCenter?: boolean;
  /** Toque en el mapa. */
  onPick?: (p: LatLng) => void;
  /** Centro del mapa al terminar de arrastrar (patrón "pin fijo al centro"). */
  onMoveEnd?: (center: LatLng) => void;
  className?: string;
  interactive?: boolean;
  children?: ReactNode;
};
