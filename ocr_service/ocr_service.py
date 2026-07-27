"""
Sparrow PaddleOCR microservice.

Exposes a single POST /ocr endpoint that accepts a multipart image upload
and returns extracted text via PaddleOCR.

Run:
    uvicorn ocr_service:app --host 0.0.0.0 --port 8001
Or use start.bat on Windows.
"""

import os
import tempfile
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
import uvicorn
from paddleocr import PaddleOCR

app = FastAPI(title="Sparrow PaddleOCR Service", version="1.0.0")

# Maps the app's language codes to PaddleOCR language identifiers.
LANGUAGE_MAP: dict[str, str] = {
    "en": "en",
    "zh": "ch",
    "ja": "japan",
    "ko": "korean",
    "de": "german",
    "fr": "french",
    "es": "es",
    "pt": "pt",
    "ar": "arabic",
    "hi": "hi",
}

# Cache OCR instances per language so models are only loaded once.
_ocr_cache: dict[str, PaddleOCR] = {}


def _get_ocr(lang: str) -> PaddleOCR:
    if lang not in _ocr_cache:
        _ocr_cache[lang] = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
    return _ocr_cache[lang]


@app.post("/ocr")
async def extract_text(
    file: UploadFile = File(...),
    language: str = Form(default="en"),
) -> JSONResponse:
    paddle_lang = LANGUAGE_MAP.get(language.lower(), "en")
    contents = await file.read()
    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        ocr = _get_ocr(paddle_lang)
        result = ocr.ocr(tmp_path, cls=True)

        lines: list[str] = []
        if result:
            for page in result:
                if not page:
                    continue
                for line in page:
                    if not line or len(line) < 2:
                        continue
                    text_info = line[1]
                    # text_info is (text_str, confidence) or just a string
                    text = text_info[0] if isinstance(text_info, (list, tuple)) else str(text_info)
                    if text and text.strip():
                        lines.append(text.strip())

        return JSONResponse({"text": "\n".join(lines), "line_count": len(lines)})

    except Exception as exc:
        return JSONResponse({"error": str(exc), "text": ""}, status_code=500)

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "paddle-ocr"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
