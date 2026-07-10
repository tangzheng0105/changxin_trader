from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Changxin Trader API",
    description="FastAPI backend for the Changxin Trader web application.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/summary")
def get_summary() -> dict[str, object]:
    return {
        "project": "Changxin Trader",
        "backend": "FastAPI",
        "frontend": "React + Ant Design",
        "features": [
            "separated frontend and backend",
            "CORS enabled for local development",
            "ready-to-extend API structure",
        ],
    }
