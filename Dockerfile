FROM node:22-bookworm-slim

# Use Debian's Chromium instead of letting Puppeteer download its own (smaller image, fewer surprises).
# These must be set before `npm ci` so whatsapp-web.js's puppeteer dep skips the Chromium download.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# chromium pulls in the shared libraries Puppeteer needs; fonts-liberation avoids tofu in rendering.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Session + chat history are written to /data, which is bind-mounted to a local host directory
# (./data) via docker-compose. Running as root keeps that bind mount writable regardless of the
# host directory's ownership/uid; Chromium already runs with --no-sandbox so root is safe here.
CMD ["node", "src/bot.js"]
