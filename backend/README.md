
# ReflectAI Backend (Journal Analyzer)

Short: FastAPI service for analyzing journal texts — psychological summary plus emotion/sentiment classification.

Core features:
- Endpoints: `POST /analyze-file` (upload .txt), `POST /analyze-text` (JSON {"text": ...}), `GET /health`
- Uses the Hugging Face Inference API when `HUGGINGFACE_API_KEY` is provided. Optional local mode (large model downloads) is available.

Quickstart (Windows PowerShell):

```powershell
# from the repository root
.\backend\start-backend.ps1
```

If you prefer using npm from the repository root:

```powershell
npm run backend
```

The launcher uses `backend\.venv\Scripts\python.exe` when it exists, creates the virtual environment if needed, installs backend dependencies once on first run, and then starts Uvicorn on `http://127.0.0.1:8000`.

Design notes / decisions:
- Chunking currently uses a simple word-based strategy (MVP). For better accuracy with models like T5/BART, switch to a tokenizer-based chunking using the model's tokenizer.
- The default models in `.env.example` keep download size moderate. For production and scaling, consider the Inference API or hosted models.
- Privacy: input texts are processed in memory and not persisted by default.

Testing:
- Run `pytest` from the `backend/` folder to execute unit tests once they are added.

Local mode:
- To force local model usage set `HF_LOCAL_MODE=true`. Note: Installing `transformers` and `torch` may require additional disk space and possibly GPU drivers for best performance.


