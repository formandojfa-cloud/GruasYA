# GruaYa — grúa por demanda con respaldo de la central

Plataforma de asistencia vial para Guatemala, con la cara del prototipo GruaYa (precio fijo, grúa en minutos, seguimiento en vivo) y un motor real por debajo:

- **Conductor** (PWA, se instala desde el navegador): marca dónde está y a dónde va, ve el **precio fijo** antes de pedir (banderazo Q300 con 10 km incluidos + Q15/km; los socios no pagan recargo), sigue a la grúa en el mapa en vivo, confirma con PIN y califica. Las asistencias ligeras de la membresía siguen incluidas.
- **Piloto (gruero / motorista)**: entra con un enlace de WhatsApp, se pone disponible, recibe ofertas con cuenta regresiva, acepta, navega, marca "Llegué" y cobra en efectivo.
- **Central**: si la app no encuentra grúa (nadie conectado, nadie aceptó, se agotó el tiempo o el cliente pidió hablar con alguien) salta una alerta; la central asigna una grúa de la red o coordina una externa por teléfono y le manda su enlace para que comparta ubicación. El conductor no nota la diferencia.

## Probarlo en línea sin instalar nada (Render, gratis)

1. Crea una cuenta en [render.com](https://render.com) (con tu cuenta de GitHub).
2. En el panel: **New → Blueprint**, conecta el repositorio `formandojfa-cloud/GruasYA` y elige la rama `claude/roadside-assistance-app-ch0lrd`. Render lee `render.yaml` y crea el servicio solo.
3. Espera a que el estado sea **Live** (5–8 minutos la primera vez). La URL queda como `https://asistencia-vial.onrender.com` (o la que Render te asigne).
4. En **Environment** agrega `MAPBOX_TOKEN` con tu token de Mapbox (el mismo del prototipo) para rutas con tráfico en vivo; sin él la app usa OSRM gratis.
5. Abre en el celular: `/` (cliente), `/driver?token=tow-zona10` (gruero), `/pbx` (operador, contraseña `pbx123`).

El plan gratuito se duerme tras 15 minutos sin uso (la primera carga tarda ~1 min) y la base se reinicia con cada despliegue; es suficiente para probar. Para repetir desde cero, en Render usa **Manual Deploy → Restart**.

## Arrancar

```bash
cp .env.example .env
npm install
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
