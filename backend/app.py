import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

from analyzer import Analyzer
from schemas import AnalyzeRequest, AnalyzeResponse, EmotionLabel


app = FastAPI(title="ReflectAI - Journal Analyzer")

# create a singleton analyzer instance
_analyzer = Analyzer()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ready": True,
        "hf_token_configured": bool(os.getenv("HUGGINGFACE_API_KEY")),
        "mode": "inference_api" if bool(os.getenv("HUGGINGFACE_API_KEY")) and os.getenv("HF_LOCAL_MODE", "false").lower() != "true" else "local_or_unconfigured"
    }


@app.post("/analyze-text", response_model=AnalyzeResponse)
async def analyze_text(req: AnalyzeRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        result = _analyzer.analyze(req.text, summary_model=req.model_summary, emotion_model=req.model_emotion)
        # If the analyzer recorded errors from upstream (e.g. HF Inference API
        # returned non-JSON or error pages), surface this as a 502 so the
        # frontend can show a helpful message instead of an empty analysis.
        metadata = result.get("metadata", {}) if isinstance(result, dict) else {}
        if metadata.get("summary_errors") or metadata.get("emotion_errors"):
            # include the metadata in the response so callers can debug
            return JSONResponse(status_code=502, content={
                "detail": "analysis produced upstream errors",
                "upstream": metadata,
            })

        return JSONResponse(status_code=200, content=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"analysis failed: {e}")


@app.post("/analyze-file", response_model=AnalyzeResponse)
async def analyze_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="only .txt files are supported in this MVP")
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="unable to decode file as utf-8 text")

    if len(text.strip()) == 0:
        raise HTTPException(status_code=400, detail="file is empty")

    try:
        result = _analyzer.analyze(text)
        return JSONResponse(status_code=200, content=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"analysis failed: {e}")

