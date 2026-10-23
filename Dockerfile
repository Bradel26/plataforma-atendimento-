# Imagem unica: API + front compilado no mesmo container.
#
# Por que unica: nesta VPS o Traefik do Coolify e o dono das portas 80 e 443, e
# nao ha subdominio proprio para separar front e API em dois enderecos. Um
# container, um dominio, sem roteamento por caminho no proxy.
#
# Para o deploy com nginx separado (VPS sem Coolify) continuam valendo os
# Dockerfiles de apps/api e apps/web.

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# O Prisma precisa do OpenSSL presente durante a geração para escolher o engine
# Debian 12/OpenSSL 3 usado no container de runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests primeiro: enquanto nao mudam, o npm ci vem do cache de camada.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --include=dev de proposito: o Coolify injeta NODE_ENV=production como build
# arg, e com ele o npm ci pula typescript, tsx e vite -- que sao exatamente as
# ferramentas que compilam esta imagem.
RUN npm ci --include=dev

COPY . .
# db:generate existe so no workspace da API; o build da raiz cobre API e front.
RUN npm run db:generate --workspace @plataforma/api \
 && npm run build

# ---- runtime ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV WHATSAPP_PROVIDER=webjs
ENV TRANSCRICAO_PROVEDOR=local
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer

# Producao apenas. O prisma (CLI) esta em dependencies de proposito: o arranque
# roda migrate deploy, e sem ele o npx tentaria baixar da internet a cada start.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
    python3 python3-venv libgomp1 \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnss3 libpango-1.0-0 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 \
    libxrender1 libxshmfence1 fonts-liberation xdg-utils \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev --workspace @plataforma/api --include-workspace-root

# Whisper roda como serviço privado no mesmo container da API. Ele escuta
# somente em loopback; não cria outra porta pública nem envia áudio a terceiros.
COPY apps/api/transcriber/requirements.txt /tmp/whisper-requirements.txt
RUN python3 -m venv /opt/whisper \
 && for tentativa in 1 2 3; do \
      /opt/whisper/bin/pip install --no-cache-dir --retries 5 --timeout 120 -r /tmp/whisper-requirements.txt && break; \
      if [ "$tentativa" -eq 3 ]; then exit 1; fi; \
      sleep 10; \
    done \
 && rm /tmp/whisper-requirements.txt

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/transcriber/main.py ./apps/api/transcriber/main.py
COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh
COPY experimentos/whatsapp-webjs-call-poc /app/experimentos/whatsapp-webjs-call-poc

# Nao roda como root: container comprometido nao vira dono do volume de anexos.
RUN mkdir -p /app/apps/api/storage/whatsapp-webjs /app/apps/api/storage/whisper-models /opt/puppeteer \
 && npm install --omit=dev --prefix /app/experimentos/whatsapp-webjs-call-poc \
 && chown -R node:node /app/apps/api/storage /app/experimentos/whatsapp-webjs-call-poc /opt/puppeteer /opt/whisper
ENV WHISPER_MODEL_DIR=/app/apps/api/storage/whisper-models
ENV WHISPER_CPU_THREADS=2
USER node

WORKDIR /app/apps/api
EXPOSE 3333

# Migrations no arranque: deploy sem migrar sobe codigo novo em banco velho, que
# e a forma mais rapida de derrubar a producao.
CMD ["tini", "--", "sh", "entrypoint.sh"]
