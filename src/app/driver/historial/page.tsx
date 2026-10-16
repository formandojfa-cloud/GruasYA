import type { Metadata } from "next";
import DriverHistory from "@/components/driver/DriverHistory";

export const metadata: Metadata = { title: "Historial del gruero" };

export default function DriverHistoryPage() {
  return <DriverHistory />;
}
