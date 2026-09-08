# Ponte do WhatsApp nao oficial.
#
# Imagem propria, e nao um estagio do Dockerfile da API, porque os dois tem
# ciclos de vida diferentes: a API reinicia a cada deploy, e a ponte NAO pode —
# reiniciar derruba a sessao do WhatsApp Web e, com ela, o atendimento.
FROM node:22-alpine AS base
WORKDIR /app

# O contexto e a raiz do monorepo: o npm workspaces precisa do package-lock de
# cima para instalar deterministicamente.
COPY package.json package-lock.json ./
COPY apps/ponte/package.json apps/ponte/

FROM base AS build
RUN npm ci --workspace @plataforma/ponte --include-workspace-root
COPY apps/ponte ./apps/ponte
RUN npm run build --workspace @plataforma/ponte

FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace @plataforma/ponte --include-workspace-root
COPY --from=build /app/apps/ponte/dist ./apps/ponte/dist

# Onde ficam as credenciais do pareamento. Montado como volume no compose:
# perder esta pasta significa escanear o QR de novo.
RUN mkdir -p /app/dados
ENV PONTE_DADOS=/app/dados

EXPOSE 3100
CMD ["node", "apps/ponte/dist/main.js"]
