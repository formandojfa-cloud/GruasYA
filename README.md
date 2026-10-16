# Asistencia Vial — grúa a un toque con respaldo del PBX

Prototipo funcional de una plataforma de asistencia vial para Guatemala:

- **Cliente** (PWA, se instala desde el navegador): fija dónde está y a dónde va, ve el precio antes de pedir (Q275 de banderazo + Q20/km; los socios no pagan recargo), sigue a la grúa en el mapa en vivo, confirma con PIN y califica.
- **Gruero / motorista**: entra con un enlace de WhatsApp, se conecta, recibe ofertas con cuenta regresiva de 40 s, acepta, navega, marca llegada y cobra.
- **PBX**: si la app no encuentra grúa (nadie conectado, nadie aceptó, se agotó el tiempo o el cliente pidió hablar con alguien) salta una alerta; el operador asigna una grúa de la red o coordina una externa por teléfono y le manda su enlace para que comparta ubicación. El cliente no nota la diferencia.

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
