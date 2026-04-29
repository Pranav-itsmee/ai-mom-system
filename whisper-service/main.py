import os
import re
import tempfile
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
# Minimum ratio of Japanese chars for a transcript to be classified as Japanese/mixed
JP_RATIO_THRESHOLD = float(os.getenv("JP_RATIO_THRESHOLD", "0.08"))

model: WhisperModel | None = None

# Japanese Unicode ranges: hiragana, katakana, CJK unified ideographs
_JP_PATTERN = re.compile(r"[぀-ゟ゠-ヿ一-鿯]")


def _detect_language_from_text(text: str, whisper_lang: str) -> str:
    """
    Improve on Whisper's single-language detection for mixed meetings.
    Whisper detects the dominant language based on the first 30s of audio,
    so it can mis-classify a meeting that starts in English but is mostly Japanese.
    We scan the full transcript for Japanese characters and override if needed.
    """
    stripped = text.replace(" ", "").replace("\n", "")
    if not stripped:
        return whisper_lang

    jp_chars = len(_JP_PATTERN.findall(stripped))
    jp_ratio = jp_chars / len(stripped)

    log.info(f"Language check — whisper={whisper_lang}, jp_chars={jp_chars}, jp_ratio={jp_ratio:.3f}")

    if jp_ratio >= JP_RATIO_THRESHOLD:
        # Japanese is significantly present — override to 'ja'
        return "ja"

    return whisper_lang


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
        size_mb = os.path.getsize(tmp_path) / 1024 / 1024
        log.info(f"Transcribing {size_mb:.1f} MB …")

        # language=None → auto-detect per audio content (not locked to one language)
        # vad_filter=True → skip silent/non-speech segments for cleaner output
        # beam_size=5 → better accuracy
        segments, info = model.transcribe(
            tmp_path,
            language=None,       # auto-detect — DO NOT hard-code a language
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )

        # Collect all segment text, preserving order
        segment_list = list(segments)
        text = " ".join(seg.text.strip() for seg in segment_list).strip()

        # Whisper detects language from the first ~30s of audio, which can be wrong
        # for mixed-language meetings. Re-check against the full transcript.
        final_lang = _detect_language_from_text(text, info.language)

        log.info(f"Done — whisper_lang={info.language}, final_lang={final_lang}, {len(text)} chars")
        return {
            "text": text,
            "language": final_lang,
            "whisper_detected_language": info.language,
        }
    except Exception as exc:
        log.error(f"Transcription failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        os.unlink(tmp_path)
