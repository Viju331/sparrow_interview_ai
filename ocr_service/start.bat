@echo off
echo ============================================================
echo  Sparrow PaddleOCR Service  ^|  http://localhost:8001
echo ============================================================
echo.
echo Starting... (first run downloads PaddleOCR models, ~200MB)
echo.
uvicorn ocr_service:app --host 0.0.0.0 --port 8001
pause
