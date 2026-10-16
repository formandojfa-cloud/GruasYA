import type { Metadata } from "next";
import { Suspense } from "react";
import { BootSpinner } from "@/components/pbx/bits";
import PbxApp from "@/components/pbx/PbxApp";

export const metadata: Metadata = {
  title: "PBX",
  description: "Panel del operador: alertas, mapa de la red y asignación manual de grúas.",
};

/** `useSearchParams` (?request=<id>) exige un límite de Suspense. */
export default function PbxPage() {
  return (
    <Suspense fallback={<BootSpinner />}>
      <PbxApp tab="panel" />
    </Suspense>
  );
}
