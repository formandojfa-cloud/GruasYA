# GrúaYa · imagen para el VPS (Hostinger u otro). Ver deploy/README.md.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall ejecuta `prisma generate` (necesita prisma/schema.prisma).
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# El token de Mapbox se incrusta en el navegador al compilar (teselas del mapa).
ARG MAPBOX_TOKEN=""
ARG NEXT_PUBLIC_CENTRAL_PHONE="5555-0000"
ENV MAPBOX_TOKEN=$MAPBOX_TOKEN NEXT_PUBLIC_CENTRAL_PHONE=$NEXT_PUBLIC_CENTRAL_PHONE NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -fsS http://localhost:3000/api/health || exit 1
CMD ["bash", "deploy/start.sh"]
