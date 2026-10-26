FROM node:22-bookworm-slim

WORKDIR /app/connector
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    WEBJS_HOST=0.0.0.0 \
    WEBJS_LOCAL_PORT=4174 \
    WEBJS_DATA_DIR=/data

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnss3 libpango-1.0-0 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
    libxrender1 libxshmfence1 fonts-liberation xdg-utils \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs analysis-queue.mjs ./
COPY public ./public
COPY web-version-cache ./web-version-cache
RUN mkdir -p /data \
 && chown -R node:node /app/connector /data /opt/puppeteer

USER node
EXPOSE 4174
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4174/api/platform/health',{headers:{Authorization:'Bearer '+(process.env.WEBJS_LOCAL_TOKEN||'')}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
