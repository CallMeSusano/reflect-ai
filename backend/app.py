from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

from analyzer import Analyzer
from schemas import AnalyzeRequest, AnalyzeResponse, WeeklyNarrativeRequest, WeeklyNarrativeResponse


app = FastAPI(title="ReflectAI - Journal Analyzer")

_analyzer = Analyzer()


@app.get("/health")
async def health():
    return {"status": "ok", "ready": True}


@app.post("/analyze-text", response_model=AnalyzeResponse)
async def analyze_text(req: AnalyzeRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        result = _analyzer.analyze(req.text, language=req.language or "en")
        return JSONResponse(status_code=200, content=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"analysis failed: {e}")


@app.post("/analyze-file", response_model=AnalyzeResponse)
async def analyze_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="only .txt files are supported")
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


@app.post("/analyze-weekly", response_model=WeeklyNarrativeResponse)
async def analyze_weekly(req: WeeklyNarrativeRequest):
    if not req.entries:
        raise HTTPException(status_code=400, detail="entries are required")
    try:
        narrative = _analyzer.generate_weekly_narrative(
            [{"title": e.title, "content": e.content} for e in req.entries],
            language=req.language or "en"
        )
        return JSONResponse(
            status_code=200,
            content={
                "narrative": narrative,
                "metadata": {
                    "num_entries": len(req.entries),
                    "model": _analyzer.model,
                },
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"analysis failed: {e}")
