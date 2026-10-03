@echo off
rem Run the whole Layla site + API locally (real Layla 1.0 on CPU, local SQLite, dev sign-in on).
rem   scripts\run_local_api.bat        -> http://127.0.0.1:8791/
rem Nothing here touches the server. Data lives in service\.local\layla.db.
setlocal
cd /d "%~dp0\.."
if not exist .local mkdir .local
set LAYLA_ENGINE=laya
set LAYLA_MODEL_PATH=..\models\layla-1.0
set LAYLA_DEVICE=cpu
set LAYLA_THREADS=4
set LAYLA_PUBLIC_DEMO=1
set LAYLA_DEV_LOGIN=1
set LAYLA_ENV=development
set LAYLA_DATABASE_URL=sqlite:///./.local/layla.db
set LAYLA_SESSION_SECRET=local-dev-only-secret-0123456789abcdefghijkl
set HF_HUB_OFFLINE=1
set PYTHONPATH=.;vendor
echo Layla is loading (about 30 seconds) ... then open http://127.0.0.1:8791/
..\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8791
