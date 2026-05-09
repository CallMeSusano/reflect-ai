
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

## Troubleshooting

### Issue: "cannot be loaded because running scripts is disabled on this system"
**Cause:** PowerShell execution policy is too restrictive.

**Solution (one-time):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Then try `npm run backend` again.

### Issue: "Python was not found"
**Cause:** Python is not installed or not in the system PATH.

**Solution:**
1. Install Python 3.9+ from [python.org](https://www.python.org/downloads/)
2. **During installation, check "Add Python to PATH"**
3. Restart terminal/PowerShell
4. Verify: `python --version`
5. Try `npm run backend` again

### Issue: Dependencies fail to install (pip errors)
**Cause:** Missing or outdated pip, or network issues.

**Solution:**
```powershell
# Manual setup
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

### Issue: "Address already in use" or port 8000 error
**Cause:** Another service is using port 8000, or the backend is already running.

**Solution:**
- Kill existing process: `netstat -ano | find ":8000"` then `taskkill /PID <PID> /F`
- Or use a different port: modify `start-backend.ps1` to change port number
- Or wait and try again (process may be shutting down)

### Issue: Backend runs but frontend shows "Could not reach analyzer backend"
**Cause:** Frontend and backend are not communicating correctly.

**Solution:**
1. Verify backend is running: open `http://127.0.0.1:8000/health` in browser
2. Check `.env.local` in project root has correct `ANALYZER_API_URL`:
   ```env
   ANALYZER_API_URL=http://127.0.0.1:8000
   ```
3. If on different machines:
   - Use backend machine's IP instead: `http://192.168.x.x:8000`
   - Make sure firewall allows port 8000
4. Check that both frontend and backend `.env` files are configured correctly

### Issue: Hugging Face models download fails or is very slow
**Cause:** First run downloads large model files (~3-5 GB total), or network issues.

**Solution:**
- This is normal on first run. Be patient.
- If using Hugging Face API mode (faster for first run):
  - Set `HUGGINGFACE_API_KEY` in `.env`
  - Keep `HF_LOCAL_MODE=false` (default)
- If you want local models, ensure you have:
  - Stable internet connection
  - ~5 GB free disk space
  - Consider running on a machine with better connectivity

### Manual Start (if script fails)
If the PowerShell script won't work, manually start the backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```


