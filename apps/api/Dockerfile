# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# O Prisma precisa do OpenSSL presente durante a geração para escolher o engine
# Debian 12/OpenSSL 3 usado no container de runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copia so os manifests primeiro: enquanto eles nao mudam, o npm ci vem do cache
# de camada e o build fica em segundos.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @plataforma/api --include-workspace-root

COPY apps/api ./apps/api
RUN npm run db:generate --workspace @plataforma/api \
 && npm run build --workspace @plataforma/api

# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV WHATSAPP_PROVIDER=webjs
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer

# Dependencias de producao apenas; o client do Prisma vem gerado do estagio
# anterior. O CLI do prisma esta em dependencies de proposito: o CMD roda
# migrate deploy, e sem ele o npx tentaria baixar da internet a cada start.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnss3 libpango-1.0-0 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
    libxrender1 libxshmfence1 fonts-liberation xdg-utils \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev --workspace @plataforma/api --include-workspace-root

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh
COPY experimentos/whatsapp-webjs-call-poc /app/experimentos/whatsapp-webjs-call-poc

# Nao roda como root: container comprometido nao vira dono do volume de anexos.
RUN mkdir -p /app/apps/api/storage/whatsapp-webjs /opt/puppeteer \
 && npm install --omit=dev --prefix /app/experimentos/whatsapp-webjs-call-poc \
 && chown -R node:node /app/apps/api/storage /app/experimentos/whatsapp-webjs-call-poc /opt/puppeteer
USER node

WORKDIR /app/apps/api
EXPOSE 3333

# As migracoes rodam no arranque: deploy sem migrar sobe codigo novo em banco
# velho, que e a forma mais rapida de derrubar a producao.
CMD ["sh", "entrypoint.sh"]
