# GruaYa

Plataforma de grúas por demanda para Guatemala: conecta a conductores varados con operadores de grúa cercanos.

Documento de alcance del MVP: https://claude.ai/code/artifact/3418bacc-ddd7-4cf8-a4ce-6294e5b900f1

## Prototipo

App web pensada para celular (React + TypeScript + Vite, mapas con Leaflet y OpenStreetMap). Por ahora no tiene servidor: los datos viven en el navegador y se sincronizan entre pestañas, para probar el flujo completo abriendo al conductor en una pestaña y al piloto en otra.

```bash
npm install
npm run dev     # abre http://localhost:5173
npm test        # pruebas de tarifa y despacho
npm run build
```

### Qué incluye

- **Conductor:** registro con celular, DPI por ambos lados y selfie; pedir grúa con precio fijo; seguimiento en mapa; chat sin compartir números; cancelación (gratis antes de que acepten, mitad del precio después); pago en efectivo con doble confirmación; calificación.
- **Piloto (gruero):** disponible / no disponible; ofertas con 90 segundos para aceptar; botones a Waze y Google Maps; 2 fotos y video 360° antes de cargar; ganancia y comisión registrada.
- **Administración:** servicios, pilotos, aprobación manual de identidad y parámetros de tarifa.

### Dónde está cada cosa

- `src/domain/`: reglas del negocio sin interfaz (tarifa, despacho por cercanía, distancias), con pruebas.
- `src/data/`: backend simulado (`store.ts`), acciones de cada papel y el motor que despacha cada segundo (`motor.ts`). Es lo que se reemplaza al conectar un servidor real.
- `src/ui/`: pantallas.

### Simulado en esta versión

Código SMS (siempre `123456`), verificación de identidad (pensada para Didit) y pilotos automáticos para probar sin otra persona. El registro de conductor está desactivado por ahora (`REGISTRO_ACTIVO` en `src/ui/Conductor.tsx`).

### Rutas, tráfico y clima

El precio usa la ruta por calles y su duración, más un recargo si llueve en el punto de recogida:

- **Con datos en la nube (varios teléfonos):** crea un proyecto gratis en [Supabase](https://supabase.com), corre `supabase/esquema.sql` en su SQL Editor y pon la Project URL y la clave anon como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (en `.env.local` o como secretos del repo). Sin esas variables la app corre en modo demo local.
- **Reparto en el servidor (recomendado con datos en la nube):** así las solicitudes se reparten, vencen y pasan a la siguiente grúa aunque nadie tenga la app a la vista. Tres pasos, una sola vez:
  1. **Desplegar la función `motor`.** Desde CI: en GitHub → Settings → Secrets añade `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens) y `SUPABASE_PROJECT_REF` (el id del proyecto, en Project Settings → General); cada push la despliega sola. A mano: Supabase → Edge Functions → Deploy a new function → "Via Editor", nombre `motor`, y pega el contenido de `supabase/functions/motor/index.ts`.
  2. **Secreto de la función:** Edge Functions → Secrets → `MAPBOX_TOKEN` con el mismo token de Mapbox (opcional; sin él usa OSRM).
  3. **Tarea programada:** abre `supabase/motor.sql`, reemplaza la URL del proyecto y la clave anon donde dice `TU-PROYECTO` / `TU_CLAVE_ANON`, y córrelo en el SQL Editor. Desde entonces la función corre cada 10 segundos y, además, la app la llama al instante al pedir, aceptar o rechazar. En Admin, el pie dice "reparto en el servidor" cuando está activo; si el servidor se cae, la app vuelve a repartir sola.
- **Notificaciones push al piloto (app cerrada o pantalla apagada):** la web se instala como app (PWA). Una vez: corre `supabase/push.sql` en el SQL Editor; en Admin → Ajustes → "Notificaciones push" genera las claves; guarda la pública como secreto `VITE_VAPID_PUBLIC_KEY` en GitHub y las dos como `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en Supabase → Edge Functions → Secrets (opcional `VAPID_SUBJECT`, un `mailto:` de contacto). El piloto toca "Conectarme" y acepta las notificaciones; desde ahí cada solicitud le llega como aviso del sistema. Android con Chrome: funciona siempre; iPhone: solo con la app agregada a la pantalla de inicio. El GPS sí sigue necesitando la app a la vista: ningún navegador manda ubicación en segundo plano.
- **Con tráfico en vivo:** crea una cuenta gratis en [Mapbox](https://account.mapbox.com/) (100,000 rutas al mes sin costo) y pon el token en un archivo `.env.local` como `VITE_MAPBOX_TOKEN=pk...`. En GitHub, guárdalo como secreto `VITE_MAPBOX_TOKEN` para que la demo lo use.
- **Sin token:** se usa [OSRM](https://project-osrm.org/) (gratis, calles reales pero sin tráfico en vivo) y se alarga la duración en horas pico (6 a 9 y 16 a 20).
- **Clima:** [Open-Meteo](https://open-meteo.com/), gratis y sin clave.
- Si ningún servicio responde, se estima con línea recta y se avisa al conductor.
