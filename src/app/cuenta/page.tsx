import type { Metadata } from "next";
import { AccountPage } from "@/components/client/AccountPage";

export const metadata: Metadata = { title: "Cuenta" };

export default function Page() {
  return <AccountPage />;
}
