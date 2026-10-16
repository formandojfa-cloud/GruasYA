// Captura de pantalla de una ruta en Chromium móvil, con sesión opcional.
//
//   node scripts/screenshot.mjs <url> <salida.png> [--as client|provider:<token>|pbx] [--wait <ms>] [--desktop]
//
// Ejemplos:
//   node scripts/screenshot.mjs http://localhost:3000/ out.png --as client
//   node scripts/screenshot.mjs "http://localhost:3000/driver" out.png --as provider:tow-zona10
//   node scripts/screenshot.mjs http://localhost:3000/pbx out.png --as pbx --desktop
//
// Imprime JSON con el status, cuántos mapas/marcadores hay y los errores de consola
// (ignora los fallos de carga de teselas de OpenStreetMap, que no hay red aquí).
import fs from "node:fs";
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const as = opt("--as", null);
const waitMs = Number(opt("--wait", "1500"));
const desktop = args.includes("--desktop");

const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (fs.existsSync(preinstalled) ? preinstalled : undefined);
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({
  ...(desktop ? { viewport: { width: 1280, height: 800 } } : devices["Pixel 7"]),
  locale: "es-GT",
  geolocation: { latitude: 14.5995, longitude: -90.5069 },
  permissions: ["geolocation"],
});

// Sesión por API para no depender de la pantalla de ingreso.
const origin = new URL(url).origin;
if (as === "client") {
  await ctx.request.post(`${origin}/api/auth/client`, { data: { phone: "5555-0001", name: "Ana López" } });
} else if (as?.startsWith("provider:")) {
  await ctx.request.post(`${origin}/api/provider/auth`, { data: { token: as.slice("provider:".length) } });
} else if (as === "pbx") {
  await ctx.request.post(`${origin}/api/pbx/auth`, { data: { password: process.env.PBX_PASSWORD ?? "pbx123", name: "Operador" } });
}

const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => ({ status: () => "ERR " + e.message }));
await page.waitForTimeout(waitMs);
const leaflet = await page.locator(".leaflet-container").count();
const markers = await page.locator(".leaflet-marker-icon").count();
const title = await page.title();
const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
await page.screenshot({ path: out, fullPage: false });
console.log(
  JSON.stringify(
    {
      status: res.status(),
      title,
      leafletContainers: leaflet,
      markers,
      bodyTextStart: text,
      errors: errors.filter((e) => !/tile\.openstreetmap|net::ERR|Failed to load resource/.test(e)).slice(0, 10),
    },
    null,
    2,
  ),
);
await browser.close();
