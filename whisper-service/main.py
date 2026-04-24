import os
import tempfile
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    log.info(f"Loading Whisper model '{MODEL_SIZE}' on CPU (int8)…")
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=4)
    log.info("Whisper model ready.")
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")

    suffix = os.path.splitext(file.filename or ".mp3")[1] or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        log.info(f"Transcribing {os.path.getsize(tmp_path) / 1024 / 1024:.1f} MB …")
        segments, info = model.transcribe(tmp_path, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        log.info(f"Done — lang={info.language}, {len(text)} chars")
        return {"text": text, "language": info.language}
    except Exception as exc:
        log.error(f"Transcription failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        os.unlink(tmp_path)
