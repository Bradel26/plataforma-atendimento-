# Imagem unica: API + front compilado no mesmo container.
#
# Por que unica: nesta VPS o Traefik do Coolify e o dono das portas 80 e 443, e
# nao ha subdominio proprio para separar front e API em dois enderecos. Um
# container, um dominio, sem roteamento por caminho no proxy.
#
# Para o deploy com nginx separado (VPS sem Coolify) continuam valendo os
# Dockerfiles de apps/api e apps/web.

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Manifests primeiro: enquanto nao mudam, o npm ci vem do cache de camada.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .
RUN npm run db:generate \
 && npm run build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Producao apenas. O prisma (CLI) esta em dependencies de proposito: o arranque
# roda migrate deploy, e sem ele o npx tentaria baixar da internet a cada start.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @plataforma/api --include-workspace-root

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/api/prisma ./apps/api/prisma

# Nao roda como root: container comprometido nao vira dono do volume de anexos.
RUN mkdir -p /app/apps/api/storage && chown -R node:node /app/apps/api/storage
USER node

WORKDIR /app/apps/api
EXPOSE 3333

# Migrations no arranque: deploy sem migrar sobe codigo novo em banco velho, que
# e a forma mais rapida de derrubar a producao.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
