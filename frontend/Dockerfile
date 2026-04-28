# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_API_URL is baked in at build time (browser uses it directly)
ARG NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
ARG BACKEND_URL=http://localhost:5000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_URL=$BACKEND_URL

RUN npm run build
# Ensure public dir exists so the runner stage copy never fails
RUN mkdir -p /app/public

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# next.config.js output: 'standalone' produces a self-contained server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public

EXPOSE 3000

CMD ["node", "server.js"]
