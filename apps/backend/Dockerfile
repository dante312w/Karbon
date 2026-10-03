# syntax=docker/dockerfile:1.7
# Imagen del backend. El contexto de construcción es la raíz del monorepo:
#   docker build -f apps/backend/Dockerfile .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV HUSKY=0 \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false
# El motor de migraciones de Prisma requiere OpenSSL.
RUN apk add --no-cache openssl

# ── Dependencias (capa cacheable: solo cambia con los package.json / lockfile) ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/desktop/package.json apps/desktop/
COPY apps/mobile/package.json apps/mobile/
COPY packages/types/package.json packages/types/
COPY packages/utils/package.json packages/utils/
COPY packages/ui/package.json packages/ui/
# `postinstall` del backend ejecuta `prisma generate`, que necesita el esquema.
COPY apps/backend/prisma apps/backend/prisma
COPY apps/backend/prisma.config.ts apps/backend/
RUN npm ci --workspace=@karbon/backend --workspace=@karbon/types --workspace=@karbon/utils --include-workspace-root

# ── Compilación ──
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types packages/types
COPY packages/utils packages/utils
COPY apps/backend apps/backend
RUN npm run build --workspace=@karbon/types --workspace=@karbon/utils \
 && npm run build --workspace=@karbon/backend \
 && npm prune --omit=dev --workspace=@karbon/backend --workspace=@karbon/types --workspace=@karbon/utils

# ── Imagen final ──
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/types/package.json ./packages/types/
COPY --from=build --chown=node:node /app/packages/types/dist ./packages/types/dist
COPY --from=build --chown=node:node /app/packages/utils/package.json ./packages/utils/
COPY --from=build --chown=node:node /app/packages/utils/dist ./packages/utils/dist
COPY --from=build --chown=node:node /app/apps/backend/package.json /app/apps/backend/prisma.config.ts ./apps/backend/
COPY --from=build --chown=node:node /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build --chown=node:node /app/apps/backend/dist ./apps/backend/dist

USER node
WORKDIR /app/apps/backend
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health > /dev/null || exit 1

# Migraciones y seed son idempotentes: se aplican en cada arranque.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/database/seed/seed.js && exec node dist/main.js"]
