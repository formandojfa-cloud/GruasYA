// Uso: node scripts/screenshot.mjs http://localhost:3000/ruta salida.png
// Abre una URL en Chromium móvil, reporta errores de consola y guarda captura.
import fs from "node:fs";
import { chromium, devices } from "@playwright/test";

const [url, out] = process.argv.slice(2);
// En este entorno hay un Chromium preinstalado; si no, Playwright usa el suyo.
const preinstalled = "/opt/pw-browsers/chromium";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (fs.existsSync(preinstalled) ? preinstalled : undefined);
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "es-GT" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => ({ status: () => "ERR " + e.message }));
await page.waitForTimeout(1500);
const leaflet = await page.locator(".leaflet-container").count();
const markers = await page.locator(".leaflet-marker-icon").count();
await page.screenshot({ path: out, fullPage: false });
console.log(JSON.stringify({ status: res.status(), leafletContainers: leaflet, markers, errors: errors.filter((e) => !/tile\.openstreetmap|net::ERR|Failed to load resource/.test(e)).slice(0, 10) }, null, 2));
await browser.close();
