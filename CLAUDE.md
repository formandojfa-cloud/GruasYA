# Guía del proyecto (para agentes y personas)

App de asistencia vial en Guatemala: membresía + grúa por demanda tipo Uber con respaldo del PBX. Lee `docs/ARCHITECTURE.md` (qué y por qué) y `docs/API.md` (contratos) antes de tocar código.

## Reglas duras

- **Idioma**: toda la interfaz en español de Guatemala (tú, no usted; "grúa", "gruero", "Q" para quetzales). Código y comentarios: español o inglés, pero consistente dentro del archivo.
- **Next.js 16**: `params`/`searchParams`/`cookies()` son **promesas** (`await`). No existe `middleware.ts` (se llama `proxy.ts`). Lee `node_modules/next/dist/docs/` si dudas; tu memoria puede ser de una versión vieja.
- **Prisma 7**: el cliente se importa desde `@/generated/prisma/client` y los enums desde `@/generated/prisma/enums`. `npx prisma generate` tras cambiar `prisma/schema.prisma`; crea migraciones con `npm run db:migrate -- --name <nombre>`.
- **Tipos compartidos**: todo lo que cruza la API está en `src/lib/types.ts`. No dupliques tipos en las interfaces; importa de ahí.
- **Mapa**: usa `src/components/map/Map.tsx` (ya es client-only). No importes `leaflet` directamente en páginas.
- **UI**: primitivas en `src/components/ui/index.tsx`; tokens en `src/app/globals.css` (`bg-surface`, `text-muted`, `bg-primary`, `text-danger`…). Pantalla de teléfono primero, botones de 48 px, zonas seguras (`safe-top`/`safe-bottom`).
- **Datos en tiempo real**: `usePolling` de `src/lib/hooks.ts`. Nada de websockets.
- **Verificación**: `npm run typecheck` siempre; `npm test` para `src/lib`; `npm run e2e` para flujos. No ejecutes `next build` mientras otro proceso corre `next dev` sobre el mismo `.next`.

## Estructura

```
prisma/            esquema, migraciones, seed
src/lib/           dominio: config, pricing, geo, dispatch (máquina de estados), views, auth, api (cliente HTTP), hooks, format
src/app/api/       rutas HTTP (ver docs/API.md)
src/app/           páginas: / (cliente), /r/[id] (seguimiento), /driver (proveedor), /pbx (operador)
src/components/    ui/ (primitivas), map/ (Leaflet)
tests/unit         Vitest (BD SQLite propia); tests/e2e Playwright (móvil)
scripts/           utilidades de desarrollo
```

## Datos de prueba

Cliente socia `5555-0001` "Ana López"; no socio `5555-0002`. PBX: contraseña `pbx123`. Proveedores: `/driver?token=tow-zona10` (también `tow-zona11`, `tow-mixco`, `tow-villanueva`, `moto-centro`, `moto-zona15`). `npm run db:clear-activity` limpia solicitudes y desconecta a todos.
