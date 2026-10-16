import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las e2e compilan a otra carpeta para no mezclar su build con `next dev`
  // (un `.next` de producción junto a `.next/dev` provoca recargas en bucle).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Native module: must stay outside the bundle.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
