# API

Todas las rutas viven en `src/app/api/**/route.ts`, devuelven JSON y usan cookies httpOnly firmadas para la sesión. Los tipos de entrada (esquemas zod) y de salida (`RequestView`, `ProviderSelf`, `PbxOverview`, …) están en `src/lib/types.ts` y son la **fuente de verdad**: impórtalos desde las interfaces.

Errores: siempre `{ "error": { "code": string, "message": string, "details"?: any } }` con el status HTTP correspondiente. `message` ya viene en español y se puede mostrar al usuario. Códigos frecuentes:

| code | status | cuándo |
|---|---|---|
| `UNAUTHORIZED` | 401 | sin sesión del rol que pide la ruta |
| `VALIDATION` | 400 | cuerpo inválido (`details` lista `path`/`message`) |
| `ACTIVE_REQUEST_EXISTS` | 409 | el cliente ya tiene un servicio en curso |
| `OFFER_NOT_FOUND` / `OFFER_UNAVAILABLE` | 404 / 409 | la oferta no es de ese proveedor / ya expiró o la tomaron |
| `INVALID_PIN` / `PIN_REQUIRED` | 400 | al iniciar el servicio |
| `INVALID_TRANSITION` / `INVALID_STATE` / `NOT_CANCELLABLE` | 409 | la solicitud no está en el estado que requiere la acción |
| `PROVIDER_BUSY` / `PROVIDER_KIND_MISMATCH` | 409 | asignación manual imposible |
| `NOT_YOUR_JOB` / `FORBIDDEN` | 403 | el recurso es de otro |

Sesiones (cookies): `rs_client` (cliente), `rs_provider` (gruero/motorista), `rs_operator` (PBX). Una misma pestaña puede tener las tres.

Tiempo real: **polling**. Cliente y proveedor consultan cada 2–3 s; el PBX cada 3–5 s. Cada `GET` de una solicitud además **avanza la cascada** si la oferta pendiente expiró (avance perezoso), y un ticker del servidor hace lo mismo cada 5 s aunque nadie consulte.

---

## Cliente

### `POST /api/auth/client` → `ClientSelf`
`{ phone: "5555-0001", name: "Ana López" }`. Crea o actualiza el usuario y abre sesión. (MVP: sin código SMS.)
`DELETE /api/auth/client` cierra sesión.

### `GET /api/me` → `ClientSelf`
Incluye `activeRequest` (la solicitud en curso, ya avanzada) o `null`, `isMember`, `vehicles`.

### `POST /api/quote` → `QuoteResponse`
`{ kind: "TOW", pickup: {lat,lng}, dropoff: {lat,lng} }`. Funciona sin sesión (cotiza como no socio). Para asistencias ligeras (`TIRE|BATTERY|FUEL|LOCKSMITH`) no se envía `dropoff`.
Respuesta: `{ quote: Quote, distanceKm, towMinutes, routeSource, geometry: {lat,lng}[], isMember, nearestProvider: { etaMinutes, distanceKm } | null }`.
- `distanceKm`/`towMinutes`/`geometry` salen de la ruta por calles recogida → destino (`lib/routes.ts`: Mapbox con tráfico si hay `MAPBOX_TOKEN`, si no OSRM público; si no hay red, `routeSource: "estimada"` = línea recta × 1.3 con factor de hora pico y `geometry` de 2 puntos). La misma distancia es la que usa `POST /api/requests` para el precio.
- `nearestProvider`: la grúa/moto conectada y fresca más cercana a la recogida, con ruta proveedor → recogida; `null` si no hay nadie. Sirve para mostrar "grúa más cercana a N min" antes de pedir.
`Quote.lines` es el desglose para mostrar; `Quote.totalQ` el total; `Quote.summary` un texto corto ("Tarifa directa de socio" / "Incluido en tu membresía").

### `POST /api/requests` → `RequestView` (201)
```json
{ "kind": "TOW", "vehicleKind": "SEDAN", "vehicleLabel": "Corolla gris", "plate": "P123ABC", "notes": "…",
  "pickup": { "lat": 14.5995, "lng": -90.5069, "address": "Zona 10" },
  "dropoff": { "lat": 14.6151, "lng": -90.5569, "address": "Taller zona 11" } }
```
La respuesta ya viene en `SEARCHING` con `search.currentOffer` (grúa contactada, `round`, `expiresAt`) **o** en `ESCALATED` si no había nadie conectado (`escalation.reason`). El `pin` de 4 dígitos viene aquí.

### `GET /api/requests` → `{ requests: RequestView[] }` historial (50 más recientes).

### `GET /api/requests/:id` → `RequestView`
Sondear cada 2–3 s mientras `status` esté en `SEARCHING|ESCALATED|EN_ROUTE|ARRIVED|IN_PROGRESS`.
- `distanceKm`, `estimatedMinutes`, `routeSource`, `routeGeometry: {lat,lng}[] | null`: la ruta del remolque guardada al crear la solicitud (null/`estimada` en asistencias ligeras o solicitudes anteriores al motor de rutas). Dibujar `routeGeometry` como polilínea recogida → destino.
- `providerLive` (solo con proveedor asignado): `{lat,lng,heading,updatedAt,target:"PICKUP"|"DROPOFF",distanceKm,etaMinutes,routeSource,routeGeometry}`. En `EN_ROUTE`/`IN_PROGRESS` la distancia, el ETA y la polilínea proveedor → objetivo vienen del motor de rutas (caché de 5 min por coordenadas redondeadas, así el sondeo es barato); sin red, estimación en línea recta.
- `provider.phone` y `provider.whatsapp` solo mientras el servicio está activo.
- `search.offersSent` / `search.maxOffers` para mostrar "Contactando grúa 2 de 5".
- `events` para la línea de tiempo (`EVENT_LABELS` en `lib/format.ts`).

### `POST /api/requests/:id/cancel` → `RequestView`
`{ reason?: string }`. Permitido en `SEARCHING|ESCALATED|EN_ROUTE|ARRIVED`. Si la grúa ya iba en camino, `cancellation.feeQ` trae el cargo (Q50 por defecto); avisar antes de confirmar.

### `POST /api/requests/:id/help` → `RequestView`
"Hablar con un operador". En `SEARCHING` escala la solicitud al PBX de inmediato; en servicios activos abre una alerta sin cambiar el estado.

### `POST /api/requests/:id/rate` → `RequestView`
`{ stars: 1..5, comment?: string }`. Solo en `COMPLETED`.

### `GET /api/track/:id` → `RequestView` (rol SHARE, **sin sesión**)
Para el enlace "compartir mi servicio": sin `pin`, sin `client`, sin teléfonos. Mismo polling.

### `GET /api/geocode?q=texto` / `?lat=&lng=` → `{ results: [{label,lat,lng}], unavailable?: true }`
Busca direcciones en Guatemala (Nominatim) o resuelve coordenadas a dirección. Si `unavailable`, la UI debe seguir funcionando con el pin en el mapa.

---

## Proveedor (gruero / motorista)

Entra con el **enlace mágico** `/driver?token=…` (el token lo genera el PBX; los de prueba están en `prisma/seed.ts`: `tow-zona10`, `tow-zona11`, `tow-mixco`, `tow-villanueva`, `moto-centro`, `moto-zona15`).

### `POST /api/provider/auth` → `ProviderSelf` — `{ token }`. `DELETE` cierra sesión.

### `GET /api/provider/me` → `ProviderSelf`
Sondear cada 2–3 s mientras está `ONLINE` o con servicio activo.
- `status`: `OFFLINE|ONLINE|BUSY`.
- `pendingOffer: OfferView | null` → mostrar pantalla de oferta con `Countdown` hasta `expiresAt` (40 s), `distanceToPickupKm`, `etaToPickupMinutes` (por calles desde la ubicación del gruero; `routeSource` dice de dónde salió), `towDistanceKm`, `payoutQ`, `pickup.address`, `dropoff.address`, `clientFirstName`.
- `activeJob: RequestView | null` (rol PROVIDER: trae `client.phone`/`client.whatsapp`, nunca `pin`).
- `today: { jobs, earningsQ }`.

### `POST /api/provider/status` → `ProviderSelf` — `{ status: "ONLINE" | "OFFLINE" }`
No se puede pasar a OFFLINE con servicio activo (`PROVIDER_BUSY`). Al desconectarse, una oferta pendiente se rechaza automáticamente.

### `POST /api/provider/location` → `{ ok, status, h3Cell, at }` — `{ lat, lng, heading? }`
Enviar cada 3–5 s mientras está conectado (y siempre durante un servicio). Sin pings recientes (2 min) no recibe ofertas; a los 10 min pasa a OFFLINE.

### `POST /api/provider/offers/:id/accept` → `RequestView` (rol PROVIDER)
Error `OFFER_UNAVAILABLE` si expiró: mostrar "La oferta ya no está disponible" y volver al estado conectado.
### `POST /api/provider/offers/:id/reject` → `{ ok: true }` (idempotente).

### `GET /api/provider/jobs/:id` → `RequestView` (rol PROVIDER)

### `POST /api/provider/jobs/:id/transition` → `RequestView`
`{ to: "ARRIVED" }` → `{ to: "IN_PROGRESS", pin: "1234" }` → `{ to: "COMPLETED" }`. El PIN lo dice el cliente en persona (verifica que es el cliente correcto, como en Uber). Errores: `INVALID_PIN`, `PIN_REQUIRED`, `INVALID_TRANSITION`.

### `POST /api/provider/jobs/:id/cancel` → `{ ok, requestStatus }` — `{ reason? }`
El proveedor se baja de un servicio `EN_ROUTE|ARRIVED`. La solicitud vuelve a buscarse (sin él) o se escala al PBX.

### `POST /api/provider/jobs/:id/rate` → `{ ok }` — califica al cliente.
### `GET /api/provider/history` → `{ jobs: (RequestView & { payoutQ })[], totalQ }`

---

## PBX (operador)

### `POST /api/pbx/auth` → `OperatorSelf` — `{ password, name? }` (`PBX_PASSWORD` del `.env`; en dev `pbx123`). `DELETE` cierra sesión.

### `GET /api/pbx/overview` → `PbxOverview`
Sondear cada 3–5 s. Todo lo del panel en una llamada:
- `alerts: AlertView[]` abiertas, de la más vieja a la más nueva, con `request` completo (rol PBX: `pin`, `client`, teléfonos, `search.currentOffer.providerId`, todos los `events`).
- `active: RequestView[]` todas las solicitudes en curso.
- `recentCompleted` últimas 20 terminadas/canceladas.
- `providers: ProviderAdminView[]` con `status`, `location`, `isStale`, `accessLink`, `whatsappInvite` (enlace wa.me con el mensaje de invitación listo), `activeRequestId`.
- `stats` y `serverTime`.

### `GET /api/pbx/requests/:id` → `RequestView` (rol PBX)

### `POST /api/pbx/requests/:id/assign` → `{ request: RequestView, invite: {accessLink, whatsapp} | null }`
Dos formas, para solicitudes en `SEARCHING|ESCALATED`:
- `{ providerId }` un proveedor existente (no `BUSY`, del tipo correcto).
- `{ external: { name, phone, kind?: "TOW"|"MOTO", plate?, vehicleLabel? } }` un gruero coordinado por teléfono: se crea (o reutiliza por teléfono) como proveedor **externo** y se devuelve `invite.whatsapp` para mandarle su enlace y que comparta ubicación sin instalar nada.

### `POST /api/pbx/requests/:id/retry` → `RequestView` — relanza la búsqueda automática de una `ESCALATED`.
### `POST /api/pbx/requests/:id/cancel` → `RequestView` — `{ reason? }` (sin cargo al cliente).
### `POST /api/pbx/alerts/:id/ack` → `{ ok }` — "ya la estoy atendiendo".

### `GET /api/pbx/providers` → `{ providers: ProviderAdminView[] }`
### `POST /api/pbx/providers` → `ProviderAdminView` (201) — alta de gruero/motorista `{ name, phone, kind, plate?, vehicleLabel? }`.
### `PATCH /api/pbx/providers/:id` → `ProviderAdminView`
`{ name?, phone?, plate?, vehicleLabel?, isExternal?, status?: "OFFLINE", rotateToken?: true }`.

---

## Utilidades
- `GET /api/health` → `{ ok, providers, time }`.
- Parámetros de negocio (tarifas, 40 s, radio, etc.): `src/lib/config.ts`, todos sobreescribibles por variables de entorno.
