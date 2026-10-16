import type { Metadata } from "next";
import { Suspense } from "react";
import DriverApp from "@/components/driver/DriverApp";
import { FullScreenSpinner } from "@/components/driver/bits";

export const metadata: Metadata = {
  title: "Piloto",
  description: "App del piloto: actívate, recibe solicitudes y lleva el servicio hasta el final.",
};

/** `useSearchParams` (token del enlace mágico) exige un límite de Suspense. */
export default function DriverPage() {
  return (
    <Suspense fallback={<FullScreenSpinner label="Entrando…" />}>
      <DriverApp />
    </Suspense>
  );
}
