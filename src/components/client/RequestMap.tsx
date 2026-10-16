"use client";

/**
 * Mapa de una solicitud: recogida, destino, proveedor en vivo y línea de ruta.
 * Mientras se busca, el mapa queda fijo en la recogida con un pulso.
 */
import MapView, { type MapMarker } from "@/components/map/Map";
import { cn } from "@/components/ui";
import type { LatLng } from "@/lib/geo";
import type { RequestView } from "@/lib/types";
import { providerGlyph, shortAddress } from "./constants";

const LIVE_STATUSES = new Set<RequestView["status"]>(["EN_ROUTE", "ARRIVED", "IN_PROGRESS"]);

export function RequestMap({ req, className }: { req: RequestView; className?: string }) {
  const searching = req.status === "SEARCHING" || req.status === "ESCALATED";
  const live = LIVE_STATUSES.has(req.status) && req.providerLive && req.provider ? req.providerLive : null;

  const markers: MapMarker[] = [
    { id: "pickup", lat: req.pickup.lat, lng: req.pickup.lng, kind: "pickup", label: req.pickup.address ? shortAddress(req.pickup.address, 2) : "Recogida" },
  ];
  if (req.dropoff && !searching) {
    markers.push({ id: "dropoff", lat: req.dropoff.lat, lng: req.dropoff.lng, kind: "dropoff", label: req.dropoff.address ? shortAddress(req.dropoff.address, 2) : "Destino" });
  }

  let polyline: LatLng[] | undefined;
  if (live && req.provider) {
    markers.push({ id: "provider", lat: live.lat, lng: live.lng, kind: "provider", heading: live.heading, glyph: providerGlyph(req.provider.kind), label: req.provider.name });
    const here = { lat: live.lat, lng: live.lng };
    const dropoff = req.dropoff ? [{ lat: req.dropoff.lat, lng: req.dropoff.lng }] : [];
    polyline = live.target === "PICKUP" ? [here, { lat: req.pickup.lat, lng: req.pickup.lng }, ...dropoff] : [here, ...dropoff];
  } else if (!searching && req.dropoff) {
    polyline = [
      { lat: req.pickup.lat, lng: req.pickup.lng },
      { lat: req.dropoff.lat, lng: req.dropoff.lng },
    ];
  }

  return (
    <div className={cn("relative", className)}>
      <MapView
        center={{ lat: req.pickup.lat, lng: req.pickup.lng }}
        zoom={15}
        markers={markers}
        polyline={polyline}
        fitToMarkers={!searching}
        followCenter={searching}
        interactive={!searching}
        className="h-full w-full"
      />
      {searching && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden>
          <span className="pulse-ring absolute h-28 w-28 rounded-full border-[3px] border-info bg-info/10" />
          <span className="pulse-ring absolute h-28 w-28 rounded-full border-[3px] border-info bg-info/10" style={{ animationDelay: "0.8s" }} />
        </div>
      )}
    </div>
  );
}
