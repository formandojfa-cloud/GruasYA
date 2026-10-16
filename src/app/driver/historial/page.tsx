import type { Metadata } from "next";
import DriverHistory from "@/components/driver/DriverHistory";

export const metadata: Metadata = { title: "Historial del piloto" };

export default function DriverHistoryPage() {
  return <DriverHistory />;
}
