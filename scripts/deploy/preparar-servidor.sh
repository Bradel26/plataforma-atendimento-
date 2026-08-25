#!/usr/bin/env bash
#
# Prepara uma VPS Ubuntu limpa para receber a plataforma. Roda uma vez.
#
#   sudo bash preparar-servidor.sh atendimento.suaempresa.com.br
#
# Faz: Node 22, nginx, certbot, firewall, usuario de servico e as pastas.
# Nao instala Postgres nem Redis — a plataforma usa Neon e Upstash.
set -euo pipefail

DOMINIO="${1:-}"
if [ -z "$DOMINIO" ]; then
  echo "Uso: sudo bash preparar-servidor.sh SEU_DOMINIO" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo." >&2
  exit 1
fi

echo "==> Atualizando o sistema"
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Node 22 (repositorio oficial da NodeSource)"
if ! command -v node > /dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> nginx, certbot, git"
apt-get install -y -qq nginx certbot python3-certbot-nginx git

echo "==> Firewall: so 22, 80 e 443"
# A porta 3333 fica fechada de proposito: quem fala com a API e o nginx, em
# 127.0.0.1. Expor a API direto derruba o HTTPS e o limite por IP.
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status

echo "==> Usuario de servico (sem shell, sem senha)"
id -u plataforma > /dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin plataforma

echo "==> Pastas"
mkdir -p /opt/plataforma /var/www/plataforma
chown -R plataforma:plataforma /opt/plataforma /var/www/plataforma

echo "==> nginx em HTTP para o dominio $DOMINIO"
if [ ! -f /etc/nginx/sites-available/plataforma ]; then
  cp "$(dirname "$0")/nginx-plataforma.conf" /etc/nginx/sites-available/plataforma
  sed -i "s/SEU_DOMINIO/$DOMINIO/" /etc/nginx/sites-available/plataforma
  ln -sf /etc/nginx/sites-available/plataforma /etc/nginx/sites-enabled/plataforma
  rm -f /etc/nginx/sites-enabled/default
fi
nginx -t
systemctl reload nginx

echo
echo "Servidor preparado."
echo
echo "Proximo passo — certificado (o certbot reescreve o nginx para HTTPS):"
echo "  sudo certbot --nginx -d $DOMINIO"
echo
echo "Depois, publique a aplicacao:"
echo "  sudo -u plataforma git clone SEU_REPOSITORIO /opt/plataforma"
echo "  sudo bash /opt/plataforma/scripts/deploy/publicar.sh"
