#!/usr/bin/env bash
#
# Publica uma versao nova. Roda a cada deploy.
#
#   sudo bash /opt/plataforma/scripts/deploy/publicar.sh
#
# Ordem importa: instala, compila, migra o banco e so entao reinicia. Reiniciar
# antes de migrar deixa a aplicacao nova falando com o banco velho.
set -euo pipefail

RAIZ=/opt/plataforma
WEB=/var/www/plataforma

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo." >&2
  exit 1
fi
if [ ! -f "$RAIZ/apps/api/.env.production" ]; then
  echo "Falta $RAIZ/apps/api/.env.production." >&2
  echo "Gere com 'npm run gerar:segredos' e preencha as URLs do provedor." >&2
  exit 1
fi

cd "$RAIZ"

echo "==> Codigo"
sudo -u plataforma git pull --ff-only

echo "==> Dependencias"
sudo -u plataforma npm ci

echo "==> Prisma e build"
sudo -u plataforma npm run db:generate
sudo -u plataforma npm run build

echo "==> Migrations no banco de producao"
# O schema declara directUrl, entao o migrate usa DIRECT_URL sozinho — conexao
# direta, sem o pool do provedor no meio. As duas variaveis precisam estar no
# .env.production, mesmo que apontem para a mesma URL.
sudo -u plataforma env NODE_ENV=production npm run db:deploy -w @plataforma/api

echo "==> Front para o nginx"
rsync -a --delete "$RAIZ/apps/web/dist/" "$WEB/"
chown -R plataforma:plataforma "$WEB"

echo "==> Servicos"
systemctl restart plataforma-api
systemctl restart plataforma-worker 2>/dev/null || echo "   (worker nao instalado — a API esta com o worker embutido)"

sleep 3
systemctl --no-pager --lines=5 status plataforma-api || true

echo
echo "==> Saude"
curl -fsS http://127.0.0.1:3333/api/health && echo || { echo "A API nao respondeu. Veja: journalctl -u plataforma-api -n 50"; exit 1; }
