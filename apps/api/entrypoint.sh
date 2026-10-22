#!/bin/sh
set -eu

npx prisma migrate deploy
BRIDGE_PID=""
if [ "${WHATSAPP_PROVIDER:-}" = "webjs" ]; then
  export WEBJS_LOCAL_PORT="${WEBJS_LOCAL_PORT:-4174}"
  export WEBJS_DATA_DIR="${WEBJS_DATA_DIR:-/app/apps/api/storage/whatsapp-webjs}"
  export API_PORT="${PORT:-3333}"
  node /app/experimentos/whatsapp-webjs-call-poc/server.mjs &
  BRIDGE_PID=$!
fi

node dist/src/main.js &
API_PID=$!

shutdown() {
  trap - TERM INT
  if [ -n "$BRIDGE_PID" ]; then kill -TERM "$BRIDGE_PID" 2>/dev/null || true; fi
  kill -TERM "$API_PID" 2>/dev/null || true
  if [ -n "$BRIDGE_PID" ]; then wait "$BRIDGE_PID" 2>/dev/null || true; fi
  wait "$API_PID" 2>/dev/null || true
}

trap shutdown TERM INT
if wait "$API_PID"; then
  STATUS=0
else
  STATUS=$?
fi
if [ -n "$BRIDGE_PID" ]; then
  kill -TERM "$BRIDGE_PID" 2>/dev/null || true
  wait "$BRIDGE_PID" 2>/dev/null || true
fi
exit "$STATUS"
