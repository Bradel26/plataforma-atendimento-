FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WHISPER_MODEL_DIR=/models \
    WHISPER_CPU_THREADS=2

WORKDIR /app
COPY apps/api/transcriber/requirements.txt ./requirements.txt
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 ca-certificates curl \
 && pip install --no-cache-dir -r requirements.txt \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /models \
 && useradd --create-home --uid 10001 whisper \
 && chown -R whisper:whisper /models

COPY --chown=whisper:whisper apps/api/transcriber/main.py ./main.py
USER whisper
EXPOSE 3334
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3334", "--no-access-log"]
