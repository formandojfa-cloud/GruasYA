/**
 * Parámetros de negocio y de despacho. Todos se pueden sobreescribir con
 * variables de entorno para ajustar sin tocar código.
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

export const PRICING = {
  tow: {
    /** Banderazo del gruero (Q). */
    baseQ: num("PRICE_TOW_BASE_Q", 275),
    /** Km incluidos en el banderazo. Pendiente de confirmar con el gruero. */
    includedKm: num("PRICE_TOW_INCLUDED_KM", 0),
    /** Precio por km adicional (Q). */
    perKmQ: num("PRICE_TOW_PER_KM_Q", 20),
  },
  /** Cargo por servicio para quien NO es socio (Q). Los socios pagan tarifa directa. */
  nonMemberTowFeeQ: num("PRICE_NON_MEMBER_TOW_FEE_Q", 50),
  /** Asistencias ligeras (llanta, batería, combustible, cerrajería) para no socios (Q). */
  lightNonMemberFlatQ: num("PRICE_LIGHT_NON_MEMBER_Q", 150),
  night: {
    enabled: bool("PRICE_NIGHT_ENABLED", false),
    startHour: num("PRICE_NIGHT_START_HOUR", 22),
    endHour: num("PRICE_NIGHT_END_HOUR", 6),
    surchargeQ: num("PRICE_NIGHT_SURCHARGE_Q", 0),
  },
  /** Cargo al cliente si cancela cuando el proveedor ya va en camino (Q). */
  cancellationFeeQ: num("PRICE_CANCELLATION_FEE_Q", 50),
  /** Factor para estimar distancia por carretera a partir de la línea recta. */
  roadFactor: num("GEO_ROAD_FACTOR", 1.3),
  /** Comisión de la plataforma sobre la tarifa del gruero (fracción). */
  platformCommission: num("PLATFORM_COMMISSION", 0.1),
} as const;

export const DISPATCH = {
  /** Tiempo que tiene un proveedor para aceptar una oferta. */
  offerTtlMs: num("DISPATCH_OFFER_TTL_MS", 40_000),
  /** Tiempo total de búsqueda automática antes de escalar al PBX. */
  searchTimeoutMs: num("DISPATCH_SEARCH_TIMEOUT_MS", 120_000),
  /** Máximo de proveedores a los que se ofrece antes de escalar. */
  maxOffersPerEpoch: num("DISPATCH_MAX_OFFERS", 5),
  /** Radio de búsqueda alrededor del punto de recogida (km). */
  searchRadiusKm: num("DISPATCH_SEARCH_RADIUS_KM", 15),
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
