FROM node:18-slim

# ── System dependencies ────────────────────────────────────────────────────────
# Chromium (for Puppeteer) + FFmpeg (for audio conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    # Chromium runtime dependencies
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

# ── Puppeteer: use installed system Chromium, skip bundled download ────────────
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ── App setup ─────────────────────────────────────────────────────────────────
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY scripts/ ./scripts/

# Temp dir for WebM/MP3 files, logs dir for Winston
RUN mkdir -p temp logs

EXPOSE 5000

CMD ["node", "src/server.js"]
