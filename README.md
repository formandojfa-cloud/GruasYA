# GruaYa

Plataforma de grúas por demanda para Guatemala: conecta a conductores varados con operadores de grúa cercanos.

Documento de alcance del MVP: https://claude.ai/code/artifact/3418bacc-ddd7-4cf8-a4ce-6294e5b900f1

## Prototipo

App web pensada para celular (React + TypeScript + Vite, mapas con Leaflet y OpenStreetMap). Por ahora no tiene servidor: los datos viven en el navegador y se sincronizan entre pestañas, para probar el flujo completo abriendo al conductor en una pestaña y al mecánico en otra.

```bash
npm install
npm run dev     # abre http://localhost:5173
npm test        # pruebas de tarifa y despacho
npm run build
```

### Qué incluye

- **Conductor:** registro con celular, DPI por ambos lados y selfie; pedir grúa con precio fijo; seguimiento en mapa; chat sin compartir números; cancelación (gratis antes de que acepten, mitad del precio después); pago en efectivo con doble confirmación; calificación.
- **Mecánico (gruero):** disponible / no disponible; ofertas con 90 segundos para aceptar; botones a Waze y Google Maps; 2 fotos y video 360° antes de cargar; ganancia y comisión registrada.
- **Administración:** servicios, mecánicos, aprobación manual de identidad y parámetros de tarifa.

### Dónde está cada cosa

- `src/domain/`: reglas del negocio sin interfaz (tarifa, despacho por cercanía, distancias), con pruebas.
- `src/data/`: backend simulado (`store.ts`), acciones de cada papel y el motor que despacha cada segundo (`motor.ts`). Es lo que se reemplaza al conectar un servidor real.
- `src/ui/`: pantallas.

### Simulado en esta versión

Código SMS (siempre `123456`), verificación de identidad (pensada para Didit) y mecánicos automáticos para probar sin otra persona. El registro de conductor está desactivado por ahora (`REGISTRO_ACTIVO` en `src/ui/Conductor.tsx`).

### Rutas, tráfico y clima

El precio usa la ruta por calles y su duración, más un recargo si llueve en el punto de recogida:

- **Con tráfico en vivo:** crea una cuenta gratis en [Mapbox](https://account.mapbox.com/) (100,000 rutas al mes sin costo) y pon el token en un archivo `.env.local` como `VITE_MAPBOX_TOKEN=pk...`. En GitHub, guárdalo como secreto `VITE_MAPBOX_TOKEN` para que la demo lo use.
- **Sin token:** se usa [OSRM](https://project-osrm.org/) (gratis, calles reales pero sin tráfico en vivo) y se alarga la duración en horas pico (6 a 9 y 16 a 20).
- **Clima:** [Open-Meteo](https://open-meteo.com/), gratis y sin clave.
- Si ningún servicio responde, se estima con línea recta y se avisa al conductor.
