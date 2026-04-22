# Stage 1: Build frontend (Next.js standalone)
FROM node:18-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ARG NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# Stage 2: Final image (Node + supervisor + Chromium + FFmpeg)
FROM node:18-slim
WORKDIR /app

# Install supervisor, Chromium (for Puppeteer), FFmpeg, mysql-client (for DB init)
RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    default-mysql-client \
    chromium \
    ffmpeg \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer: use system Chromium, skip bundled browser download
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Backend: install production deps and copy source
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --legacy-peer-deps

COPY backend/src/ ./backend/src/
COPY backend/scripts/ ./backend/scripts/

RUN mkdir -p backend/temp backend/logs

# Frontend: copy standalone artifacts
COPY --from=frontend-build /app/.next/standalone ./frontend/
COPY --from=frontend-build /app/.next/static     ./frontend/.next/static
RUN mkdir -p ./frontend/public

# Supervisor config + entrypoint
COPY supervisord.conf /etc/supervisor/conf.d/mom.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000 5000

ENTRYPOINT ["/entrypoint.sh"]
