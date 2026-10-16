/**
 * Contratos compartidos entre la API y las tres interfaces (cliente, proveedor,
 * PBX). Los esquemas zod validan la entrada de la API; los tipos `*View` son lo
 * que la API devuelve. Ver docs/API.md.
 */
import { z } from "zod";
import type {
  AssignedBy,
  CancelledBy,
  ChatRole,
  IdentityStatus,
  MediaKind,
  MediaOwnerType,
  PauseReason,
  Problem,
  ProviderKind,
  ProviderStatus,
  RequestStatus,
  ServiceKind,
  TowVehicleType,
  VehicleKind,
  Weather,
} from "@/generated/prisma/enums";
import type { Quote } from "./pricing";
import type { RouteSource } from "./routes";

export type {
  AssignedBy,
  CancelledBy,
  ChatRole,
  IdentityStatus,
  MediaKind,
  MediaOwnerType,
  PauseReason,
  Problem,
  ProviderKind,
  ProviderStatus,
  RequestStatus,
  ServiceKind,
  TowVehicleType,
  VehicleKind,
  Weather,
};
export type { Quote, QuoteLine, Tariff, VehicleClass } from "./pricing";
export type { RouteSource } from "./routes";
export type { AppSettings, DispatchSettings, Flags, PublicConfig, SettingsPatch } from "./settings";

// ---------- Entrada ----------

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const PlaceSchema = LatLngSchema.extend({
  address: z.string().trim().max(200).optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const ServiceKindSchema = z.enum(["TOW", "TIRE", "BATTERY", "FUEL", "LOCKSMITH"]);
export const VehicleKindSchema = z.enum(["SEDAN", "SUV", "PICKUP", "MOTO"]);
/** Qué pasó: No arranca · Choque · Llanta sin repuesto · Otro. */
export const ProblemSchema = z.enum(["NO_START", "CRASH", "FLAT_NO_SPARE", "OTHER"]);
export const WeatherSchema = z.enum(["NONE", "RAIN", "HEAVY_RAIN"]);
export const TowVehicleTypeSchema = z.enum(["PLATFORM", "DRAG"]);

export const PhoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-().]/g, ""))
  .pipe(z.string().regex(/^(\+?502)?[2-7]\d{7}$/, "Número de Guatemala inválido (8 dígitos)"))
  .transform((s) => s.replace(/^\+?502/, ""));

export const QuoteRequestSchema = z.object({
  kind: ServiceKindSchema,
  /** Para el factor por vehículo (Moto 0.8 · Carro 1 · Pickup o camioneta 1.2); por defecto Carro. */
  vehicleKind: VehicleKindSchema.optional(),
  pickup: LatLngSchema,
  dropoff: LatLngSchema.optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const CreateRequestSchema = z
  .object({
    kind: ServiceKindSchema,
    vehicleKind: VehicleKindSchema,
    vehicleLabel: z.string().trim().max(80).optional(),
    plate: z.string().trim().max(12).optional(),
    notes: z.string().trim().max(300).optional(),
    problem: ProblemSchema.optional(),
    pickup: PlaceSchema,
    dropoff: PlaceSchema.optional(),
  })
  .refine((v) => v.kind !== "TOW" || !!v.dropoff, {
    message: "La grúa necesita un destino",
    path: ["dropoff"],
  });
export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;

export const ClientLoginSchema = z.object({
  phone: PhoneSchema,
  name: z.string().trim().min(2).max(60),
});

/** `POST /api/auth/client/start`. */
export const PhoneStartSchema = z.object({ phone: PhoneSchema });

/** `POST /api/auth/client/verify`: el nombre solo hace falta la primera vez. */
export const PhoneVerifySchema = z.object({
  phone: PhoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "El código tiene 6 dígitos"),
  name: z.string().trim().min(2).max(60).optional(),
  plate: z.string().trim().max(12).optional(),
  vehicleKind: VehicleKindSchema.optional(),
});

export const IdentityDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(300).optional(),
});

export const ChatPostSchema = z.object({ text: z.string().trim().min(1).max(500) });

export const ProviderLoginSchema = z.object({ token: z.string().trim().min(8).max(200) });

export const OperatorLoginSchema = z.object({
  password: z.string().min(1).max(200),
  name: z.string().trim().min(2).max(60).optional(),
});

export const ProviderStatusSchema = z.object({ status: z.enum(["ONLINE", "OFFLINE"]) });

export const LocationPingSchema = LatLngSchema.extend({
  heading: z.number().min(0).max(360).optional(),
});

export const ProviderTransitionSchema = z.object({
  to: z.enum(["ARRIVED", "IN_PROGRESS", "COMPLETED"]),
  pin: z.string().regex(/^\d{4}$/).optional(),
});

export const CancelSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const RateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(300).optional(),
});

export const ExternalProviderSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone: PhoneSchema,
  kind: z.enum(["TOW", "MOTO"]).default("TOW"),
  plate: z.string().trim().max(12).optional(),
  vehicleLabel: z.string().trim().max(80).optional(),
  /** Plataforma o arrastre (grúas). */
  vehicleType: TowVehicleTypeSchema.optional(),
});

export const PbxAssignSchema = z
  .object({
    providerId: z.string().min(1).optional(),
    external: ExternalProviderSchema.optional(),
  })
  .refine((v) => !!v.providerId !== !!v.external, {
    message: "Indica providerId o los datos de un proveedor externo, no ambos",
  });

// ---------- Salida ----------

export type ProviderCard = {
  id: string;
  name: string;
  kind: ProviderKind;
  plate: string | null;
  vehicleLabel: string | null;
  /** Plataforma o arrastre. */
  vehicleType: TowVehicleType;
  photoUrl: string | null;
  rating: number | null;
  ratingCount: number;
  isExternal: boolean;
  /** Solo para el PBX, y para el cliente mientras el servicio está activo si `Settings.shareContactNumbers`. */
  phone?: string;
  /** Enlace de WhatsApp listo para abrir (cuando `phone` es visible). */
  whatsapp?: string;
};

export type LiveLocation = {
  lat: number;
  lng: number;
  heading: number | null;
  updatedAt: string;
  /** Distancia y tiempo estimado hasta el objetivo actual del proveedor. */
  target: "PICKUP" | "DROPOFF";
  distanceKm: number;
  etaMinutes: number;
};

export type RequestEventView = { type: string; at: string; data: Record<string, unknown> | null };

export type SearchView = {
  epoch: number;
  startedAt: string;
  deadlineAt: string;
  /** Proveedores contactados en la búsqueda actual. */
  offersSent: number;
  maxOffers: number;
  currentOffer: {
    id: string;
    round: number;
    expiresAt: string;
    providerName: string;
    /** Solo PBX. */
    providerId?: string;
  } | null;
};

export type EscalationView = {
  at: string;
  reason: string;
  alertId: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
};

/** Estado de la verificación de identidad de un usuario o gruero. */
export type IdentityView = {
  status: IdentityStatus;
  note: string | null;
  reviewedAt: string | null;
  /** Id de `GET /api/media/:id` por tipo de foto. */
  media: Partial<Record<MediaKind, string>>;
  required: MediaKind[];
  missing: MediaKind[];
};

export type MediaView = {
  id: string;
  kind: MediaKind;
  ownerType: MediaOwnerType;
  requestId: string | null;
  mime: string;
  size: number;
  url: string;
  createdAt: string;
};

export type ChatMessageView = {
  id: string;
  senderRole: ChatRole;
  senderId: string;
  senderName: string;
  text: string;
  at: string;
};

export type RequestView = {
  id: string;
  kind: ServiceKind;
  status: RequestStatus;
  vehicleKind: VehicleKind;
  vehicleLabel: string | null;
  plate: string | null;
  notes: string | null;
  /** Qué pasó (No arranca · Choque · Llanta sin repuesto · Otro). */
  problem: Problem | null;
  pickup: Place;
  dropoff: Place | null;
  distanceKm: number;
  /** Duración estimada del remolque al cotizar (min). */
  estimatedMinutes: number | null;
  weatherAtRequest: Weather | null;
  routeSource: RouteSource | null;
  /** Trazo por calles recogida → destino (null si no hubo ruta). */
  routeGeometry: Place[] | null;
  /** Mensajes en el chat del servicio. */
  chatCount: number;
  isMember: boolean;
  quote: Quote;
  priceTotal: number;
  /** Cliente y PBX. El proveedor lo pide al cliente al iniciar el servicio. */
  pin?: string;
  client?: { id: string; name: string; phone: string; whatsapp: string };
  provider: ProviderCard | null;
  providerLive: LiveLocation | null;
  assignedBy: AssignedBy | null;
  search: SearchView;
  escalation: EscalationView | null;
  timestamps: {
    createdAt: string;
    assignedAt: string | null;
    arrivedAt: string | null;
    startedAt: string | null;
    deliveredAt: string | null;
    paidAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
  };
  /** Evidencias de carga subidas por el gruero (ids de `GET /api/media/:id`). */
  loadMedia: { photos: string[]; videos: string[] };
  cancellation: { by: CancelledBy; reason: string | null; feeQ: number } | null;
  ratings: { client: number | null; provider: number | null };
  events: RequestEventView[];
  updatedAt: string;
};

export type OfferView = {
  id: string;
  requestId: string;
  round: number;
  expiresAt: string;
  kind: ServiceKind;
  vehicleKind: VehicleKind;
  vehicleLabel: string | null;
  problem: Problem | null;
  pickup: Place;
  dropoff: Place | null;
  /** Desde el proveedor hasta el punto de recogida. */
  distanceToPickupKm: number;
  etaToPickupMinutes: number;
  /** Distancia del remolque. */
  towDistanceKm: number;
  towMinutes: number | null;
  payoutQ: number;
  /** Lo que el cliente paga en efectivo. */
  totalQ: number;
  clientFirstName: string;
};

export type ProviderSelf = {
  id: string;
  name: string;
  phone: string;
  kind: ProviderKind;
  plate: string | null;
  vehicleLabel: string | null;
  vehicleType: TowVehicleType;
  status: ProviderStatus;
  isExternal: boolean;
  rating: number | null;
  ratingCount: number;
  identity: IdentityView;
  consecutiveMissed: number;
  pausedReason: PauseReason | null;
  location: { lat: number; lng: number; heading: number | null; updatedAt: string } | null;
  pendingOffer: OfferView | null;
  activeJob: RequestView | null;
  today: { jobs: number; earningsQ: number };
};

export type ClientSelf = {
  id: string;
  name: string;
  phone: string;
  phoneVerifiedAt: string | null;
  isMember: boolean;
  membershipExpiresAt: string | null;
  identity: IdentityView;
  /** Saldo pendiente (cargos de cancelación) que bloquea pedir otra grúa. */
  balanceDueQ: number;
  activeRequest: RequestView | null;
  vehicles: { id: string; plate: string; label: string; kind: VehicleKind }[];
};

/** Conductor en Central → Conductores. */
export type UserAdminView = {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  phoneVerifiedAt: string | null;
  isMember: boolean;
  membershipExpiresAt: string | null;
  identity: IdentityView;
  balanceDueQ: number;
  requests: { total: number; completed: number; cancelled: number; active: number };
  createdAt: string;
};

export type OperatorSelf = { id: string; name: string };

export type ProviderAdminView = ProviderCard & {
  phone: string;
  status: ProviderStatus;
  location: { lat: number; lng: number; heading: number | null; updatedAt: string } | null;
  h3Cell: string | null;
  isStale: boolean;
  accessLink: string;
  whatsappInvite: string;
  activeRequestId: string | null;
  identityStatus: IdentityStatus;
  identityNote: string | null;
  consecutiveMissed: number;
  pausedReason: PauseReason | null;
  createdAt: string;
};

export type AlertView = {
  id: string;
  requestId: string;
  reason: string;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  request: RequestView;
};

export type PbxOverview = {
  operator: OperatorSelf;
  alerts: AlertView[];
  active: RequestView[];
  recentCompleted: RequestView[];
  providers: ProviderAdminView[];
  stats: {
    online: number;
    busy: number;
    searching: number;
    escalated: number;
    inService: number;
    completedToday: number;
    escalationRate7d: number | null;
  };
  serverTime: string;
};

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export const ACTIVE_STATUSES: readonly RequestStatus[] = [
  "SEARCHING",
  "ESCALATED",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
  "DELIVERED",
];

/** Respuesta de `POST /api/quote`. */
export type QuoteResponse = {
  quote: Quote;
  distanceKm: number;
  minutes: number;
  routeSource: RouteSource | null;
  weather: Weather;
  geometry: Place[] | null;
  isMember: boolean;
  /** Compatibilidad: igual a `minutes`. */
  towMinutes: number;
};
