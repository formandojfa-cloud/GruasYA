import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GruaYa", template: "%s · GruaYa" },
  description: "Grúa por demanda en Guatemala: precio fijo, grúa en minutos y seguimiento en vivo.",
  applicationName: "GruaYa",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "GruaYa" },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f5b301",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-GT" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface text-foreground">{children}</body>
    </html>
  );
}
