import type { Metadata } from "next";
import { Suspense } from "react";
import { BootSpinner } from "@/components/pbx/bits";
import PbxApp from "@/components/pbx/PbxApp";

export const metadata: Metadata = {
  title: "Proveedores · PBX",
  description: "Red de grúas y motoristas: estado, enlaces de acceso y alta de proveedores.",
};

export default function PbxProvidersPage() {
  return (
    <Suspense fallback={<BootSpinner />}>
      <PbxApp tab="providers" />
    </Suspense>
  );
}
