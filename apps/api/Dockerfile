# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

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
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Dependencias de producao apenas; o client do Prisma vem gerado do estagio anterior.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @plataforma/api --include-workspace-root

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/prisma ./apps/api/prisma

# Nao roda como root: container comprometido nao vira dono do volume de anexos.
RUN mkdir -p /app/apps/api/storage && chown -R node:node /app/apps/api/storage
USER node

WORKDIR /app/apps/api
EXPOSE 3333

# As migracoes rodam no arranque: deploy sem migrar sobe codigo novo em banco
# velho, que e a forma mais rapida de derrubar a producao.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
