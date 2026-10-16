"use client";

/**
 * App del cliente: sesión → inicio → (recogida → destino → cotización) →
 * solicitud activa. Un pequeño paso-a-paso tipo Uber; el borrador se guarda en
 * sessionStorage y la solicitud en curso se retoma desde /api/me al recargar.
 */
import { useEffect, useMemo, useState } from "react";
import { KIND_LABELS } from "@/lib/format";
import { useGeolocationWatch } from "@/lib/hooks";
import type { ClientSelf, Place, RequestView, ServiceKind } from "@/lib/types";
import { ActiveRequest } from "./ActiveRequest";
import { GUATEMALA_CITY, isLightKind, placeLabel, STORAGE_DRAFT } from "./constants";
import { HomeScreen } from "./HomeScreen";
import { LocationStep } from "./LocationStep";
import { QuoteStep } from "./QuoteStep";
import { SessionGate, SessionProvider, useSession } from "./session";
import { useVehicle } from "./useVehicle";

type Step =
  | { step: "home" }
  | { step: "pickup"; kind: ServiceKind; pickup?: Place; dropoff?: Place }
  | { step: "dropoff"; kind: ServiceKind; pickup: Place; dropoff?: Place }
  | { step: "quote"; kind: ServiceKind; pickup: Place; dropoff: Place | null }
  | { step: "active"; request: RequestView };

const DRAFT_STEPS = new Set<Step["step"]>(["pickup", "dropoff", "quote"]);

function loadDraft(): Step | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Step;
    return DRAFT_STEPS.has(parsed.step) ? parsed : null;
  } catch {
    return null;
  }
}

export default function ClientApp() {
  return (
    <SessionProvider>
      <SessionGate>{(me) => <ClientFlow me={me} />}</SessionGate>
    </SessionProvider>
  );
}

/** Solo se monta con sesión (en el navegador), así que puede leer sessionStorage al iniciar. */
function ClientFlow({ me }: { me: ClientSelf }) {
  const { refresh } = useSession();
  const geo = useGeolocationWatch(true);
  const lat = geo.position?.lat;
  const lng = geo.position?.lng;
  const gps = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng]);
  const [vehicle, setVehicle] = useVehicle(me);
  const [step, setStep] = useState<Step>(() =>
    me.activeRequest ? { step: "active", request: me.activeRequest } : (loadDraft() ?? { step: "home" }),
  );

  useEffect(() => {
    try {
      if (DRAFT_STEPS.has(step.step)) window.sessionStorage.setItem(STORAGE_DRAFT, JSON.stringify(step));
      else window.sessionStorage.removeItem(STORAGE_DRAFT);
    } catch {
      /* sin almacenamiento */
    }
  }, [step]);

  /** Vuelve a /api/me: si hay servicio en curso lo retoma; si no, al inicio. */
  async function resume() {
    const fresh = await refresh();
    setStep(fresh?.activeRequest ? { step: "active", request: fresh.activeRequest } : { step: "home" });
  }

  switch (step.step) {
    case "home":
      return (
        <HomeScreen
          me={me}
          gps={gps}
          gpsError={geo.error}
          vehicle={vehicle}
          onVehicleChange={setVehicle}
          onPick={(kind) => setStep({ step: "pickup", kind })}
        />
      );
    case "pickup": {
      const light = isLightKind(step.kind);
      return (
        <LocationStep
          key="pickup"
          kind="pickup"
          title="¿Dónde estás?"
          subtitle={KIND_LABELS[step.kind]}
          initial={step.pickup ?? gps ?? GUATEMALA_CITY}
          gps={gps}
          gpsError={geo.error}
          cta={light ? "Confirmar mi ubicación" : "Confirmar recogida"}
          onBack={() => setStep({ step: "home" })}
          onConfirm={(pickup) =>
            setStep(light ? { step: "quote", kind: step.kind, pickup, dropoff: null } : { step: "dropoff", kind: step.kind, pickup, dropoff: step.dropoff })
          }
        />
      );
    }
    case "dropoff":
      return (
        <LocationStep
          key="dropoff"
          kind="dropoff"
          title="¿A dónde llevamos tu vehículo?"
          subtitle={`Recogida: ${placeLabel(step.pickup)}`}
          initial={step.dropoff ?? step.pickup}
          gps={gps}
          cta="Confirmar destino"
          markers={[{ id: "pickup", lat: step.pickup.lat, lng: step.pickup.lng, kind: "pickup", label: "Recogida" }]}
          onBack={() => setStep({ step: "pickup", kind: step.kind, pickup: step.pickup, dropoff: step.dropoff })}
          onConfirm={(dropoff) => setStep({ step: "quote", kind: step.kind, pickup: step.pickup, dropoff })}
        />
      );
    case "quote":
      return (
        <QuoteStep
          kind={step.kind}
          pickup={step.pickup}
          dropoff={step.dropoff}
          vehicle={vehicle}
          me={me}
          onBack={() =>
            setStep(
              step.dropoff
                ? { step: "dropoff", kind: step.kind, pickup: step.pickup, dropoff: step.dropoff }
                : { step: "pickup", kind: step.kind, pickup: step.pickup },
            )
          }
          onEditPickup={() => setStep({ step: "pickup", kind: step.kind, pickup: step.pickup, dropoff: step.dropoff ?? undefined })}
          onEditDropoff={() => setStep({ step: "dropoff", kind: step.kind, pickup: step.pickup, dropoff: step.dropoff ?? undefined })}
          onCreated={(request) => setStep({ step: "active", request })}
          onActiveExists={() => void resume()}
        />
      );
    case "active":
      return <ActiveRequest key={step.request.id} initial={step.request} onNewService={() => void resume()} />;
  }
}
