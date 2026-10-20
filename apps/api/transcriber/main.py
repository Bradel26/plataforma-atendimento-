"""Private, CPU-only Whisper endpoint for recorded-call transcription."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from threading import Lock

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
def transcribe(model: str = Form(...), file: UploadFile = File(...)) -> dict[str, str]:
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
        segments, _info = recognizer.transcribe(temporary_path, beam_size=5, vad_filter=True)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise HTTPException(status_code=422, detail="No speech detected")
        return {"text": text}
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
