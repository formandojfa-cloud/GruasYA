import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GrúaYa",
    short_name: "GrúaYa",
    description: "Grúa por demanda en Guatemala: precio fijo, grúa en minutos y seguimiento en vivo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f2f2",
    theme_color: "#f2f2f2",
    lang: "es-GT",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
