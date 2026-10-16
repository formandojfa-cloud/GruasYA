import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de extremo a extremo contra el servidor de desarrollo. Usan una base
 * separada (prisma/e2e.db) para no pisar los datos de desarrollo.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

// Chromium preinstalado (entornos sin descarga de navegadores); si no existe, el de Playwright.
const preinstalledChromium = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (fs.existsSync(preinstalledChromium) ? preinstalledChromium : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "es-GT",
    geolocation: { latitude: 14.5995, longitude: -90.5069 },
    permissions: ["geolocation"],
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } }],
  webServer: {
    command: `npx prisma migrate deploy && npx tsx prisma/seed.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "file:./prisma/e2e.db",
      AUTH_SECRET: "e2e-secret",
      PBX_PASSWORD: "e2e-pbx",
      APP_URL: `http://localhost:${PORT}`,
      // Cascada rápida para que las pruebas no esperen 40 s por oferta.
      DISPATCH_OFFER_TTL_MS: "6000",
      DISPATCH_TICKER_MS: "1000",
    },
  },
});
