# Changxin Trader

前后端分离 Web 项目模板：

- 后端：Python + FastAPI
- 前端：React + Vite + Ant Design

## Project Structure

```text
backend/
  app/
    main.py
  requirements.txt
frontend/
  src/
    api/
    components/
    styles/
  package.json
  vite.config.js
```

## Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open API docs: http://127.0.0.1:8000/docs

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open app: http://127.0.0.1:5173

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`.
