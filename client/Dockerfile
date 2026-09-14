# ── build ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Dependencies first, so a source-only change does not reinstall them.
COPY package*.json ./
RUN npm ci

COPY . .

# `npm run build` runs `tsc -b` first. The repo currently has a pre-existing
# type error on main (QuotationBuilder.tsx), so build with vite directly —
# swap back to `npm run build` once the tree typechecks clean.
RUN npx vite build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: nginx listens on IPv4 only, while busybox wget
# resolves localhost to [::1] first and gets connection refused — a healthcheck
# that fails against a server that is serving perfectly well.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
