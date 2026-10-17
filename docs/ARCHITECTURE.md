# Arquitectura

Plataforma de asistencia vial para Guatemala: **membresía** para asistencias ligeras (llanta, batería, combustible, cerrajería) y **grúa por demanda tipo Uber**, con el **PBX como respaldo automático** cuando la app no encuentra grúa.

## Flujo principal (grúa)

```
Cliente fija recogida y destino → ve precio (Q275 + Q20/km, socio sin recargo) → pide
   │
   ▼  SEARCHING
Oferta al gruero conectado más cercano (40 s) ──acepta──▶ EN_ROUTE ─▶ ARRIVED ─PIN▶ IN_PROGRESS ─▶ COMPLETED
   │ rechaza / no responde                                   │
   ▼ siguiente más cercano (máx. 5, 2 min en total)          │ el gruero se baja → vuelve a SEARCHING sin él
   │ nadie disponible / tiempo agotado / cliente pide ayuda
   ▼  ESCALATED  →  alerta al PBX  →  operador asigna (de la red o un gruero externo con enlace WhatsApp) → EN_ROUTE
```

El cliente nunca nota la diferencia: su app siempre muestra "grúa asignada, llega en N min", venga de la cascada automática o del operador.

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| App | Next.js 16 (App Router, Turbopack), React 19, TypeScript | una sola base de código para las tres interfaces (PWA instalable) y la API |
| Datos | Prisma 7 + PostgreSQL en **Supabase** (prod) · Postgres local (dev y pruebas) | datos persistentes entre despliegues, gratis; mismo esquema en todos lados |
| Mapas | Leaflet + OpenStreetMap | sin llave ni costo; cambiar a Google/Mapbox es un `TileLayer` |
| Geo | H3 (Uber) para indexar proveedores, haversine × 1.3 para distancia urbana | sin motor de rutas al inicio; `lib/geo.ts` es el punto de cambio |
| Tiempo real | polling 2–3 s + ticker de servidor 5 s + latido externo `/api/tick` desde Supabase (pg_cron) cada 10 s | simple, robusto; la cascada avanza aunque el servidor duerma |
| Estilos | Tailwind v4 con tokens en `globals.css` | estética alto-contraste tipo Uber, modo oscuro automático |
| Pruebas | Vitest (unitarias, Postgres propio) · Playwright (e2e, móvil) | el motor de despacho se prueba tal cual corre |

## Módulos (`src/lib`)

- `config.ts` — parámetros de negocio y despacho; todos con variable de entorno.
- `pricing.ts` — `quoteFor()`: función pura. Grúa: banderazo + km adicionales (redondeo hacia arriba) + cargo no socio (+Q50) + nocturno opcional. Ligeras: Q0 socio / tarifa plana no socio. Calcula también `providerPayoutQ` (comisión 10 %) y `platformRevenueQ`.
- `geo.ts` — haversine, distancia por carretera estimada, ETA (25 km/h), H3.
- `dispatch.ts` — **máquina de estados**. Toda transición es `updateMany` condicionada al estado previo + candado por solicitud en el proceso, así ticker y lecturas concurrentes no duplican ofertas. Funciones: `createRequest`, `advanceRequest` (avance perezoso), `advanceAll` (ticker), `acceptOffer`, `rejectOffer`, `assignProvider`, `retrySearch`, `providerTransition`, `cancelRequest`, `providerBailout`, `requestOperatorHelp`, `setProviderStatus`, `recordProviderLocation`, `rateRequest`.
- `views.ts` — proyección por rol (`CLIENT`, `PROVIDER`, `PBX`, `SHARE`): el PIN solo lo ve el cliente y el PBX; los teléfonos solo durante el servicio.
- `selfviews.ts`, `pbx.ts` — agregados para `/api/me`, `/api/provider/me`, `/api/pbx/overview`.
- `auth.ts` — cookies HMAC por rol; `notifications.ts` — enlaces WhatsApp, enlace mágico del proveedor, salida de alertas al PBX (hoy log; mañana WhatsApp Cloud API / llamada).
- `ticker.ts` + `src/instrumentation.ts` — intervalo de servidor que avanza cascadas y desconecta proveedores sin señal.

## Reglas de despacho (configurables)

- Candidatos: mismo tipo (grúa/moto), `ONLINE`, ping de ubicación en los últimos 2 min, dentro de 15 km del punto de recogida, sin otra oferta pendiente, que no hayan rechazado/cancelado esta solicitud ni hayan sido contactados en la búsqueda actual. Orden: distancia.
- Oferta: 40 s. Máximo 5 ofertas por búsqueda. Tiempo total 2 min. Luego `ESCALATED`.
- Proveedor externo (coordinado por el PBX): al terminar vuelve a `OFFLINE`; solo entra a la cascada automática si él mismo se conecta en su app. El PBX puede marcarlo como de la red (`isExternal: false`).
- Cancelación del cliente con grúa en camino: Q50. Cancelación mientras busca: sin cargo.

## Interfaces

- `/` cliente (PWA): pedir, cotizar, buscar, seguir, PIN, calificar, historial. `/r/:id` seguimiento (y enlace para compartir).
- `/driver` proveedor: entra con enlace mágico, se conecta, recibe ofertas con cuenta regresiva, navega, marca llegada, pide PIN, termina.
- `/pbx` operador: alertas, mapa de grúas, asignación manual (red o externo con WhatsApp), reintentar búsqueda, cancelar, alta de proveedores.

## Seguridad y camino a producción

Lo que **falta** antes de cobrar dinero real, en orden:

1. **Verificación de teléfono** (código por SMS/WhatsApp) en el alta de clientes. Hoy basta con el número.
2. **PostgreSQL** (`provider = "postgresql"` + `@prisma/adapter-pg`) y mover el candado por solicitud a `SELECT … FOR UPDATE` si hay más de una instancia.
3. **Notificaciones push / WhatsApp** al proveedor (oferta nueva) y al operador (alerta); el punto de integración es `notifications.ts`.
4. **Motor de rutas** (OSRM/Google) en `geo.ts` para distancia y ETA reales.
5. **Pagos**: cobro con tarjeta en la app (Recurrente/Stripe) y cuota mensual; hoy el pago es en efectivo al gruero y la comisión se liquida aparte.
6. **Números enmascarados** (Twilio Proxy) para que cliente y gruero no vean sus teléfonos.
7. `AUTH_SECRET` fuerte, `PBX_PASSWORD` por operador (o cuentas), HTTPS, límites de tasa en `/api/auth/*` y `/api/geocode`.
8. Aviso legal: la membresía se vende como *asistencia*, no como seguro; revisar con abogado (SIB).

## Desarrollo

```bash
cp .env.example .env
npm install            # genera el cliente de Prisma
npm run db:migrate     # crea prisma/dev.db
npm run db:seed        # clientes, proveedores y operador de prueba
npm run dev            # http://localhost:3000
npm run typecheck && npm test && npm run e2e
npm run db:clear-activity   # borra solicitudes y desconecta proveedores para repetir una demo
```

Datos de prueba: cliente socia `5555-0001` (Ana), no socio `5555-0002` (Carlos); PBX contraseña `pbx123`; grueros `/driver?token=tow-zona10|tow-zona11|tow-mixco|tow-villanueva`, motoristas `moto-centro|moto-zona15`.
