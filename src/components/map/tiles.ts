/**
 * Teselas del mapa, estilo Uber (claras y apagadas). Sin importar Leaflet, para
 * que la hoja/credito puedan leer la atribución sin cargar el mapa.
 *
 *  1. NEXT_PUBLIC_TILE_URL manda si está definido (cualquier servidor XYZ).
 *  2. Con NEXT_PUBLIC_MAPBOX_TOKEN (next.config.ts lo rellena desde MAPBOX_TOKEN) → Mapbox Light.
 *  3. Si no, CARTO Positron (gratis, requiere atribución).
 */
export type TileSource = {
  url: string;
  attribution: string;
  /** Texto plano de la atribución para el crédito pequeño del teléfono. */
  credit: string;
  subdomains: string;
  tileSize: number;
  zoomOffset: number;
  maxZoom: number;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const TILE_OVERRIDE = process.env.NEXT_PUBLIC_TILE_URL ?? "";

const OSM = '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const TILES: TileSource = TILE_OVERRIDE
  ? { url: TILE_OVERRIDE, attribution: `&copy; ${OSM}`, credit: "© OpenStreetMap", subdomains: "abc", tileSize: 256, zoomOffset: 0, maxZoom: 19 }
  : MAPBOX_TOKEN
    ? {
        url: `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`,
        attribution: `&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; ${OSM}`,
        credit: "© Mapbox © OpenStreetMap",
        subdomains: "abc",
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 20,
      }
    : {
        url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        attribution: `&copy; ${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
        credit: "© OpenStreetMap © CARTO",
        subdomains: "abcd",
        tileSize: 256,
        zoomOffset: 0,
        maxZoom: 20,
      };
