# Backend

FastAPI backend service.

## XtTraderPyApi

Runtime files are stored in:

- `vendor/xttrader/`: `XtTraderPyApi*.pyd` and required DLLs
- `config/`: `traderApi.ini`, `traderApi.log4cxx`, `server.crt`

Local credentials are read from `.env`. Use `.env.example` as the template.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API docs are available at http://127.0.0.1:8000/docs.
