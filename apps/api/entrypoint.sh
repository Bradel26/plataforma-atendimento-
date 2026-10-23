#!/bin/sh
set -eu

npx prisma migrate deploy
BRIDGE_PID=""
WHISPER_PID=""
if [ "${TRANSCRICAO_PROVEDOR:-desativada}" = "local" ]; then
  export WHISPER_MODEL_DIR="${WHISPER_MODEL_DIR:-/app/apps/api/storage/whisper-models}"
  export WHISPER_CPU_THREADS="${WHISPER_CPU_THREADS:-2}"
  mkdir -p "$WHISPER_MODEL_DIR"
  /opt/whisper/bin/uvicorn main:app --app-dir /app/apps/api/transcriber --host 127.0.0.1 --port 3334 --no-access-log &
  WHISPER_PID=$!
fi
if [ "${WHATSAPP_PROVIDER:-}" = "webjs" ]; then
  export WEBJS_LOCAL_PORT="${WEBJS_LOCAL_PORT:-4174}"
  export WEBJS_DATA_DIR="${WEBJS_DATA_DIR:-/app/apps/api/storage/whatsapp-webjs}"
  mkdir -p "$WEBJS_DATA_DIR"
  if [ -z "${WPP_CONNECT_WEBHOOK_SECRET:-}" ]; then
    segredo_ponte="$WEBJS_DATA_DIR/.webhook-secret"
    if [ -s "$segredo_ponte" ]; then
      WPP_CONNECT_WEBHOOK_SECRET="$(cat "$segredo_ponte")"
    else
      WPP_CONNECT_WEBHOOK_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
      (umask 077; printf '%s' "$WPP_CONNECT_WEBHOOK_SECRET" > "$segredo_ponte")
    fi
    export WPP_CONNECT_WEBHOOK_SECRET
  fi
  export API_PORT="${PORT:-3333}"
  node /app/experimentos/whatsapp-webjs-call-poc/server.mjs &
  BRIDGE_PID=$!
fi

node dist/src/main.js &
API_PID=$!

shutdown() {
  trap - TERM INT
  if [ -n "$BRIDGE_PID" ]; then kill -TERM "$BRIDGE_PID" 2>/dev/null || true; fi
  if [ -n "$WHISPER_PID" ]; then kill -TERM "$WHISPER_PID" 2>/dev/null || true; fi
  kill -TERM "$API_PID" 2>/dev/null || true
  if [ -n "$BRIDGE_PID" ]; then wait "$BRIDGE_PID" 2>/dev/null || true; fi
  if [ -n "$WHISPER_PID" ]; then wait "$WHISPER_PID" 2>/dev/null || true; fi
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
if [ -n "$WHISPER_PID" ]; then
  kill -TERM "$WHISPER_PID" 2>/dev/null || true
  wait "$WHISPER_PID" 2>/dev/null || true
fi
exit "$STATUS"
