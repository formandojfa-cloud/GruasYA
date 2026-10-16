/**
 * Contratos compartidos entre la API y las tres interfaces (cliente, proveedor,
 * PBX). Los esquemas zod validan la entrada de la API; los tipos `*View` son lo
 * que la API devuelve. Ver docs/API.md.
 */
import { z } from "zod";
import type {
  AssignedBy,
  CancelledBy,
  ProviderKind,
  ProviderStatus,
  RequestStatus,
  ServiceKind,
  VehicleKind,
} from "@/generated/prisma/enums";
import type { Quote } from "./pricing";

export type { AssignedBy, CancelledBy, ProviderKind, ProviderStatus, RequestStatus, ServiceKind, VehicleKind };
export type { Quote, QuoteLine } from "./pricing";

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

export const PhoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-().]/g, ""))
  .pipe(z.string().regex(/^(\+?502)?[2-7]\d{7}$/, "Número de Guatemala inválido (8 dígitos)"))
  .transform((s) => s.replace(/^\+?502/, ""));

export const QuoteRequestSchema = z.object({
  kind: ServiceKindSchema,
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
  photoUrl: string | null;
  rating: number | null;
  ratingCount: number;
  isExternal: boolean;
  /** Solo visible para el cliente mientras el servicio está activo, y para el PBX. */
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

export type RequestView = {
  id: string;
  kind: ServiceKind;
  status: RequestStatus;
  vehicleKind: VehicleKind;
  vehicleLabel: string | null;
  plate: string | null;
  notes: string | null;
  pickup: Place;
  dropoff: Place | null;
  distanceKm: number;
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
    completedAt: string | null;
    cancelledAt: string | null;
  };
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
  pickup: Place;
  dropoff: Place | null;
  /** Desde el proveedor hasta el punto de recogida. */
  distanceToPickupKm: number;
  etaToPickupMinutes: number;
  /** Distancia del remolque. */
  towDistanceKm: number;
  payoutQ: number;
  clientFirstName: string;
};

export type ProviderSelf = {
  id: string;
  name: string;
  phone: string;
  kind: ProviderKind;
  plate: string | null;
  vehicleLabel: string | null;
  status: ProviderStatus;
  isExternal: boolean;
  rating: number | null;
  ratingCount: number;
  location: { lat: number; lng: number; heading: number | null; updatedAt: string } | null;
  pendingOffer: OfferView | null;
  activeJob: RequestView | null;
  today: { jobs: number; earningsQ: number };
};

export type ClientSelf = {
  id: string;
  name: string;
  phone: string;
  isMember: boolean;
  membershipExpiresAt: string | null;
  activeRequest: RequestView | null;
  vehicles: { id: string; plate: string; label: string; kind: VehicleKind }[];
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
];
