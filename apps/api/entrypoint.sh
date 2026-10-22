#!/bin/sh
set -eu

npx prisma migrate deploy
if [ "${WHATSAPP_PROVIDER:-}" = "webjs" ]; then
  export WEBJS_LOCAL_PORT="${WEBJS_LOCAL_PORT:-4174}"
  export WEBJS_DATA_DIR="${WEBJS_DATA_DIR:-/app/apps/api/storage/whatsapp-webjs}"
  export API_PORT="${PORT:-3333}"
  node /app/experimentos/whatsapp-webjs-call-poc/server.mjs &
fi
exec node dist/src/main.js
