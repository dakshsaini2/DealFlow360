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
# tsconfig.json must land BEFORE `prisma generate`: the prisma-client generator
# reads it to decide whether its own imports carry .js or .ts extensions. With
# no tsconfig in sight it emits .ts, tsc copies those specifiers into dist
# verbatim, and the built server dies on "Cannot find module
# .../internal/class.ts" — while the same command works locally, where the file
# has always been there.
COPY tsconfig.json ./

# The client is generated, not committed, so it has to be built here.
RUN npx prisma generate

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
# and tsx, so dev dependencies stay in this image. `--include=dev` is load
# bearing: NODE_ENV=production above makes npm omit them by default, which
# leaves tsx missing and the entrypoint's seed step dying with "tsx: not found".
RUN npm ci --include=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# The whole of src, not just the generated client: prisma/seed.ts is run through
# tsx at boot and imports ../src/common/* directly, so the TypeScript sources
# have to be here or seeding dies with ERR_MODULE_NOT_FOUND. (src is ~800K on
# top of the generated client that has to be copied regardless.)
COPY --from=build /app/src ./src
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Node runs as root by default, which it does not need to.
USER node

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
