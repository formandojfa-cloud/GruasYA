# GruaYa — grúa por demanda con respaldo de la central

Plataforma de asistencia vial para Guatemala, con la cara del prototipo GruaYa (precio fijo, grúa en minutos, seguimiento en vivo) y un motor real por debajo:

- **Conductor** (PWA, se instala desde el navegador): marca dónde está y a dónde va, ve el **precio fijo** antes de pedir (banderazo Q300 con 10 km incluidos + Q15/km; los socios no pagan recargo), sigue a la grúa en el mapa en vivo, confirma con PIN y califica. Las asistencias ligeras de la membresía siguen incluidas.
- **Piloto (gruero / motorista)**: entra con un enlace de WhatsApp, se pone disponible, recibe ofertas con cuenta regresiva, acepta, navega, marca "Llegué" y cobra en efectivo.
- **Central**: si la app no encuentra grúa (nadie conectado, nadie aceptó, se agotó el tiempo o el cliente pidió hablar con alguien) salta una alerta; la central asigna una grúa de la red o coordina una externa por teléfono y le manda su enlace para que comparta ubicación. El conductor no nota la diferencia.

## Desplegar en tu VPS (Hostinger) — recomendado

Docker + HTTPS automático, siempre despierto, datos en Supabase. Guía paso a paso en [`deploy/README.md`](deploy/README.md). Resumen:

```bash
curl -fsSL https://raw.githubusercontent.com/formandojfa-cloud/GruasYA/claude/roadside-assistance-app-ch0lrd/deploy/instalar.sh | bash
nano /opt/gruaya/.env                      # DOMINIO, DATABASE_URL (Supabase), PBX_PASSWORD
cd /opt/gruaya && bash deploy/actualizar.sh
```

## Probarlo en línea sin instalar nada (Supabase + Render, gratis)

Los datos viven en **Supabase** (PostgreSQL) y la app corre en **Render**. Así nada se borra al redesplegar.

1. **Supabase.** Crea un proyecto gratis en [supabase.com](https://supabase.com) (o usa el del prototipo). En **Project Settings → Database → Connection string** copia la URI del **Session pooler** (puerto 5432) y pon tu contraseña donde dice `[YOUR-PASSWORD]`.
2. **Render.** Crea una cuenta en [render.com](https://render.com) (con tu cuenta de GitHub). En el panel: **New → Blueprint**, conecta el repositorio `formandojfa-cloud/GruasYA` y elige la rama `claude/roadside-assistance-app-ch0lrd`. Render lee `render.yaml`, te pide `DATABASE_URL` (pega la URI de Supabase) y crea el servicio solo. Al arrancar aplica las migraciones y carga los datos de prueba.
3. Espera a que el estado sea **Live** (5–8 minutos la primera vez). La URL queda como `https://asistencia-vial.onrender.com` (o la que Render te asigne).
3b. **Latido desde Supabase (recomendado).** Copia el valor de `TICK_SECRET` que Render generó (Environment), abre `supabase/motor.sql`, reemplaza `TU-APP` y `TU_TICK_SECRET`, y córrelo en el SQL Editor de Supabase. Desde entonces Supabase llama a la app cada 10 s y las ofertas vencen y pasan a la siguiente grúa aunque el servidor del plan gratuito esté dormido.
4. En **Environment** agrega `MAPBOX_TOKEN` con tu token de Mapbox (el mismo del prototipo) para rutas con tráfico en vivo; sin él la app usa OSRM gratis.
5. Abre en el celular: `/` (cliente), `/driver?token=tow-zona10` (gruero), `/pbx` (operador, contraseña `pbx123`).

El plan gratuito de Render se duerme tras 15 minutos sin uso (la primera carga tarda ~1 min); los datos quedan en Supabase. Para limpiar solicitudes y desconectar a todos sin borrar clientes ni grúas: `DATABASE_URL=<uri de Supabase> npm run db:clear-activity` desde tu máquina.

## Arrancar

```bash
cp .env.example .env
npm install
npm run db:local   # Postgres 16 local en el puerto 5433 (o apunta DATABASE_URL a tu propio Postgres / Supabase)
npm run db:migrate
npm run db:seed
npm run dev        # http://localhost:3000
```

Rutas: `/` cliente · `/driver?token=tow-zona10` proveedor · `/pbx` operador (contraseña `pbx123`).

Pruebas: `npm run typecheck`, `npm test` (motor de despacho), `npm run e2e` (flujo completo en Chromium móvil).

## Documentación

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): flujo, máquina de estados, stack, reglas de despacho, camino a producción.
- [`docs/API.md`](docs/API.md): todas las rutas con ejemplos.
- [`CLAUDE.md`](CLAUDE.md): convenciones del repositorio.
