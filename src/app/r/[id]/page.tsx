import type { Metadata } from "next";
import { TrackPage } from "@/components/client/TrackPage";

export const metadata: Metadata = { title: "Seguimiento" };

/** Seguimiento de una solicitud (dueño o enlace compartido). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrackPage id={id} />;
}
