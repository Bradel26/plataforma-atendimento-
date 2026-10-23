"""Private, CPU-only Whisper endpoint for recorded-call transcription."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
_model: WhisperModel | None = None
_model_lock = Lock()
_max_bytes = 10 * 1024 * 1024
_model_dir = Path(os.environ.get("WHISPER_MODEL_DIR", "/app/apps/api/storage/whisper-models"))


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


def _get_model() -> WhisperModel:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = WhisperModel(
                    os.environ.get("TRANSCRICAO_LOCAL_MODELO", "base"),
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=max(1, int(os.environ.get("WHISPER_CPU_THREADS", "2"))),
                    download_root=str(_model_dir),
                )
    return _model


@app.post("/v1/audio/transcriptions")
def transcribe(model: str = Form(...), language: str | None = Form(None), file: UploadFile = File(...)) -> dict[str, Any]:
    del model  # The deployment chooses its model; clients cannot change resource use.
    suffix = Path(file.filename or "audio.webm").suffix.lower()
    if suffix not in {".webm", ".m4a", ".mp4", ".mp3", ".wav", ".mpeg", ".mpga"}:
        suffix = ".webm"

    content = file.file.read(_max_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(content) > _max_bytes:
        raise HTTPException(status_code=413, detail="Audio file exceeds 10 MB")

    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            temporary.write(content)
            temporary_path = temporary.name

        recognizer = _get_model()
        segments, info = recognizer.transcribe(
            temporary_path,
            language=language or None,
            beam_size=5,
            vad_filter=True,
        )
        segments = list(segments)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise HTTPException(status_code=422, detail="No speech detected")
        avg_logprob = sum(segment.avg_logprob for segment in segments) / len(segments)
        no_speech_prob = max(segment.no_speech_prob for segment in segments)
        alternatives: list[str] = []
        if avg_logprob < -0.45 or no_speech_prob > 0.25:
            try:
                retry_segments, _retry_info = recognizer.transcribe(
                    temporary_path,
                    language=language or None,
                    beam_size=3,
                    temperature=0.2,
                    condition_on_previous_text=False,
                    vad_filter=True,
                )
                retry_segments = list(retry_segments)
                alternative = " ".join(segment.text.strip() for segment in retry_segments).strip()
                if alternative and alternative.casefold() != text.casefold():
                    alternatives.append(alternative)
            except Exception:
                # A segunda hipótese ajuda a corrigir trechos duvidosos, mas não
                # deve descartar a transcrição principal se essa tentativa falhar.
                pass
        return {
            "text": text,
            "language": info.language,
            "avgLogprob": round(avg_logprob, 4),
            "noSpeechProb": round(no_speech_prob, 4),
            "alternatives": alternatives,
        }
    except HTTPException:
        raise
    except Exception as error:
        # Do not include audio content, transcript, or model internals in logs.
        print(f"[whisper-local] transcription failed: {type(error).__name__}", flush=True)
        raise HTTPException(status_code=503, detail="Local transcription temporarily unavailable") from error
    finally:
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
