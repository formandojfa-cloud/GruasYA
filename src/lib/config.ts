/**
 * Valores por defecto del negocio y del despacho. Los parámetros que el
 * operador edita en vivo viven en la fila `Settings` de la BD
 * (`src/lib/settings.ts`); lo de aquí son solo los **defaults** con los que se
 * crea esa fila (y los que usa el código cuando todavía no la ha leído). Todos
 * se pueden sobreescribir con variables de entorno.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/** Tarifa de grúa del prototipo GruaYa (decisión 2026-10-09). */
export const TARIFF_DEFAULTS = {
  banderazo: num("TARIFA_BANDERAZO_Q", 300),
  kmIncluidos: num("TARIFA_KM_INCLUIDOS", 10),
  precioKm: num("TARIFA_PRECIO_KM_Q", 15),
  minutosIncluidos: num("TARIFA_MINUTOS_INCLUIDOS", 15),
  precioMinuto: num("TARIFA_PRECIO_MINUTO_Q", 3),
  factorMoto: num("TARIFA_FACTOR_MOTO", 0.8),
  factorCarro: num("TARIFA_FACTOR_CARRO", 1),
  factorPickup: num("TARIFA_FACTOR_PICKUP", 1.2),
  recargoNocturno: num("TARIFA_RECARGO_NOCTURNO", 1.2),
  horaNocheInicio: num("TARIFA_HORA_NOCHE_INICIO", 22),
  horaNocheFin: num("TARIFA_HORA_NOCHE_FIN", 6),
  recargoLluvia: num("TARIFA_RECARGO_LLUVIA", 1.15),
  recargoLluviaFuerte: num("TARIFA_RECARGO_LLUVIA_FUERTE", 1.3),
  comision: num("PLATFORM_COMMISSION", 0.1),
  fraccionCancelacion: num("TARIFA_FRACCION_CANCELACION", 0.5),
  /** Cargo por servicio para quien NO es socio (Q). Los socios pagan tarifa directa. */
  nonMemberTowFeeQ: num("PRICE_NON_MEMBER_TOW_FEE_Q", 50),
  /** Asistencias ligeras (llanta, batería, combustible, cerrajería) para no socios (Q). */
  lightNonMemberFlatQ: num("PRICE_LIGHT_NON_MEMBER_Q", 150),
  /** Minutos tras la asignación en que cancelar es gratis. */
  freeCancelMinutes: num("FREE_CANCEL_MINUTES", 2),
} as const;

/** Interruptores de producto (Central → Ajustes). */
export const FLAG_DEFAULTS = {
  weather: "NONE" as "NONE" | "RAIN" | "HEAVY_RAIN",
  shareContactNumbers: bool("SHARE_CONTACT_NUMBERS", false),
  requireLoadPhotos: bool("REQUIRE_LOAD_PHOTOS", true),
  requirePin: bool("REQUIRE_PIN", true),
  identityRequiredForTow: bool("IDENTITY_REQUIRED_FOR_TOW", false),
} as const;

/**
 * Compatibilidad: parámetros de precio en la forma anterior. Son los mismos
 * defaults; el precio real sale de `Settings` (ver `pricing.ts`).
 */
export const PRICING = {
  tow: {
    baseQ: TARIFF_DEFAULTS.banderazo,
    includedKm: TARIFF_DEFAULTS.kmIncluidos,
    perKmQ: TARIFF_DEFAULTS.precioKm,
  },
  nonMemberTowFeeQ: TARIFF_DEFAULTS.nonMemberTowFeeQ,
  lightNonMemberFlatQ: TARIFF_DEFAULTS.lightNonMemberFlatQ,
  night: {
    enabled: true,
    startHour: TARIFF_DEFAULTS.horaNocheInicio,
    endHour: TARIFF_DEFAULTS.horaNocheFin,
    factor: TARIFF_DEFAULTS.recargoNocturno,
  },
  /** Cargo fijo de cancelación (Q) de la versión anterior; el motor pasa a usar `fraccionCancelacion`. */
  cancellationFeeQ: num("PRICE_CANCELLATION_FEE_Q", 50),
  /** Factor para estimar distancia por carretera a partir de la línea recta. */
  roadFactor: num("GEO_ROAD_FACTOR", 1.3),
  /** Comisión de la plataforma sobre la tarifa del gruero (fracción). */
  platformCommission: TARIFF_DEFAULTS.comision,
} as const;

export const DISPATCH = {
  /** Tiempo que tiene un proveedor para aceptar una oferta (default de arranque; `Settings.offerSeconds` manda). */
  offerTtlMs: num("DISPATCH_OFFER_TTL_MS", 40_000),
  /** Tiempo total de búsqueda automática antes de escalar al PBX. */
  searchTimeoutMs: num("DISPATCH_SEARCH_TIMEOUT_MS", 120_000),
  /** Máximo de proveedores a los que se ofrece antes de escalar. */
  maxOffersPerEpoch: num("DISPATCH_MAX_OFFERS", 5),
  /** Radio de búsqueda alrededor del punto de recogida (km). */
  searchRadiusKm: num("DISPATCH_SEARCH_RADIUS_KM", 15),
  /** Radios escalonados del prototipo (km): se prueba cada uno antes de escalar. */
  radiiKm: [5, 10] as readonly number[],
  /** Tiempo de oferta del prototipo (s). */
  offerSeconds: num("DISPATCH_OFFER_SECONDS", 90),
  /** Ofertas ignoradas/rechazadas seguidas que pausan al gruero. */
  rechazosParaPausar: num("DISPATCH_MISSED_TO_PAUSE", 3),
  /** Un proveedor sin ping de ubicación en este tiempo no recibe ofertas. */
  providerStaleMs: num("DISPATCH_PROVIDER_STALE_MS", 120_000),
  /** Un proveedor ONLINE sin ping en este tiempo pasa a OFFLINE. */
  providerOfflineAfterMs: num("DISPATCH_PROVIDER_OFFLINE_MS", 10 * 60_000),
  /** Velocidad promedio en ciudad para estimar llegada (km/h). */
  avgSpeedKmh: num("DISPATCH_AVG_SPEED_KMH", 25),
  /** Resolución H3 para indexar proveedores (8 ≈ hexágonos de ~0.7 km²). */
  h3Resolution: num("DISPATCH_H3_RESOLUTION", 8),
  /** Intervalo del ticker de servidor que avanza la cascada. */
  tickerIntervalMs: num("DISPATCH_TICKER_MS", 5_000),
} as const;

export const SESSION = {
  cookieClient: "rs_client",
  cookieProvider: "rs_provider",
  cookieOperator: "rs_operator",
  maxAgeSeconds: 60 * 60 * 24 * 30,
} as const;

/** Centro por defecto del mapa: Ciudad de Guatemala. */
export const DEFAULT_CENTER = { lat: 14.6349, lng: -90.5069 } as const;

/** Zona horaria del negocio: el recargo nocturno y la hora pico se calculan aquí. */
export const TIME_ZONE = "America/Guatemala";

/** Carpeta donde se guardan fotos y videos (identidad, evidencias de carga). */
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** `POST /api/auth/client` (ingreso sin código) solo en desarrollo/pruebas o con ALLOW_UNVERIFIED_LOGIN=1. */
export function unverifiedLoginAllowed(): boolean {
  return process.env.ALLOW_UNVERIFIED_LOGIN === "1" || !isProduction();
}
