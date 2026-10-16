import type { Metadata } from "next";
import { HistoryPage } from "@/components/client/HistoryPage";

export const metadata: Metadata = { title: "Historial" };

export default function Page() {
  return <HistoryPage />;
}
