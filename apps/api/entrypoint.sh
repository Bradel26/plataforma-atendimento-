#!/bin/sh
set -eu

npx prisma migrate deploy

WHISPER_PID=""
TRANSCRICAO_PROVEDOR="${TRANSCRICAO_PROVEDOR:-local}"
export TRANSCRICAO_PROVEDOR
if [ "$TRANSCRICAO_PROVEDOR" = "local" ]; then
  export WHISPER_MODEL_DIR="${WHISPER_MODEL_DIR:-/app/apps/api/storage/whisper-models}"
  /opt/whisper-venv/bin/uvicorn main:app \
    --app-dir /app/apps/api/transcriber \
    --host 127.0.0.1 \
    --port 3334 \
    --no-access-log &
  WHISPER_PID=$!
fi

node dist/src/main.js &
API_PID=$!

shutdown() {
  kill "$API_PID" 2>/dev/null || true
  if [ -n "$WHISPER_PID" ]; then kill "$WHISPER_PID" 2>/dev/null || true; fi
  wait "$API_PID" 2>/dev/null || true
  if [ -n "$WHISPER_PID" ]; then wait "$WHISPER_PID" 2>/dev/null || true; fi
}
trap shutdown INT TERM

set +e
wait "$API_PID"
STATUS=$?
set -e
shutdown
exit "$STATUS"
