"use client";

/**
 * App del cliente: sesión → hoja "Pedir" (recogida, destino, qué pasó, servicio
 * y precio en una sola hoja sobre el mapa) → solicitud activa. Recogida y destino
 * se afinan con el pin central en pasos aparte. El borrador se guarda en
 * sessionStorage y la solicitud en curso se retoma desde /api/me al recargar.
 */
import { useEffect, useMemo, useState } from "react";
import { useGeolocationWatch } from "@/lib/hooks";
import type { ClientSelf, Place, RequestView, ServiceKind } from "@/lib/types";
import { ActiveRequest } from "./ActiveRequest";
import { GUATEMALA_CITY, isLightKind, STORAGE_DRAFT } from "./constants";
import { HomeScreen } from "./HomeScreen";
import { LocationStep } from "./LocationStep";
import { SessionGate, SessionProvider, useSession } from "./session";
import { useVehicle } from "./useVehicle";

/** Lo que el usuario lleva elegido en la hoja "Pedir". */
export type Draft = { kind: ServiceKind; pickup: Place | null; dropoff: Place | null };

type Step =
  | ({ step: "home" } & Draft)
  | ({ step: "pickup" } & Draft)
  | ({ step: "dropoff" } & Draft)
  | { step: "active"; request: RequestView };

const DRAFT_STEPS = new Set<Step["step"]>(["home", "pickup", "dropoff"]);
const EMPTY: Draft = { kind: "TOW", pickup: null, dropoff: null };

function loadDraft(): Step | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Step> & Partial<Draft>;
    if (!parsed.step || !DRAFT_STEPS.has(parsed.step) || !parsed.kind) return null;
    return parsed as Step;
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
    me.activeRequest ? { step: "active", request: me.activeRequest } : (loadDraft() ?? { step: "home", ...EMPTY }),
  );

  useEffect(() => {
    try {
      if (DRAFT_STEPS.has(step.step)) window.sessionStorage.setItem(STORAGE_DRAFT, JSON.stringify(step));
      else window.sessionStorage.removeItem(STORAGE_DRAFT);
    } catch {
      /* sin almacenamiento */
    }
  }, [step]);

  /** Vuelve a /api/me: si hay servicio en curso lo retoma; si no, a la hoja "Pedir" limpia. */
  async function resume() {
    const fresh = await refresh();
    setStep(fresh?.activeRequest ? { step: "active", request: fresh.activeRequest } : { step: "home", ...EMPTY });
  }

  switch (step.step) {
    case "home":
      return (
        <HomeScreen
          me={me}
          gps={gps}
          gpsError={geo.error}
          draft={step}
          onDraftChange={(d) => setStep({ step: "home", ...d })}
          vehicle={vehicle}
          onVehicleChange={setVehicle}
          onEditPickup={() => setStep({ ...step, step: "pickup" })}
          onEditDropoff={() => setStep({ ...step, step: "dropoff" })}
          onCreated={(request) => setStep({ step: "active", request })}
          onActiveExists={() => void resume()}
        />
      );
    case "pickup": {
      const light = isLightKind(step.kind);
      return (
        <LocationStep
          key="pickup"
          kind="pickup"
          initial={step.pickup ?? gps ?? GUATEMALA_CITY}
          gps={gps}
          gpsError={geo.error}
          cta={light ? "Confirmar mi ubicación" : "Confirmar dónde estás"}
          hasDropoff={!light}
          onBack={() => setStep({ ...step, step: "home" })}
          onConfirm={(pickup) => setStep({ ...step, step: "home", pickup })}
          onNext={(pickup) => setStep({ ...step, step: "dropoff", pickup })}
        />
      );
    }
    case "dropoff": {
      // Sin recogida fija, la recogida es tu ubicación actual (o la ciudad si no hay GPS).
      const pickup = step.pickup ?? gps ?? GUATEMALA_CITY;
      return (
        <LocationStep
          key="dropoff"
          kind="dropoff"
          initial={step.dropoff ?? pickup}
          gps={gps}
          cta="Confirmar destino"
          hasDropoff
          markers={[{ id: "pickup", lat: pickup.lat, lng: pickup.lng, kind: "pickup", label: "Recogida" }]}
          onBack={() => setStep({ ...step, step: "home" })}
          onConfirm={(dropoff) => setStep({ ...step, step: "home", dropoff })}
          onPrev={() => setStep({ ...step, step: "pickup" })}
        />
      );
    }
    case "active":
      return <ActiveRequest key={step.request.id} initial={step.request} onNewService={() => void resume()} />;
  }
}
