import type { Metadata } from "next";
import { Suspense } from "react";
import { BootSpinner } from "@/components/pbx/bits";
import PbxApp from "@/components/pbx/PbxApp";

export const metadata: Metadata = {
  title: "Pilotos · Central",
  description: "Red de grúas y motoristas: estado, enlaces de acceso y alta de pilotos.",
};

export default function PbxProvidersPage() {
  return (
    <Suspense fallback={<BootSpinner />}>
      <PbxApp tab="providers" />
    </Suspense>
  );
}
