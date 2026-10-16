import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GrúaYa", template: "%s · GrúaYa" },
  description: "Grúa por demanda en Guatemala: precio fijo, grúa en minutos y seguimiento en vivo.",
  applicationName: "GrúaYa",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "GrúaYa" },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f2" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-GT" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface text-foreground">{children}</body>
    </html>
  );
}
