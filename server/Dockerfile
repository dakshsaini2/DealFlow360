# ── build ───────────────────────────────────────────
# Debian rather than Alpine: Prisma's query engine is built against glibc, and
# the musl variant needs an extra binaryTarget for no benefit here.
FROM node:22-slim AS build

# Prisma's engine downloader needs OpenSSL to pick the right binary.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
# The client is generated, not committed, so it has to be built here.
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# `tsc` emits JavaScript and nothing else, so the query engine binary that
# Prisma generated alongside the client is not carried into dist. Copy it, or
# every query fails at runtime with "Query engine library not found".
RUN cp src/generated/prisma/*.node dist/generated/prisma/ 2>/dev/null || true

# ── runtime ─────────────────────────────────────────
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# `prisma migrate deploy` and the seed both run at boot, and both need the CLI
# and tsx, so dev dependencies stay in this image.
RUN npm ci && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Node runs as root by default, which it does not need to.
USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
