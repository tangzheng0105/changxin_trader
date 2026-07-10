from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router as trader_router

app = FastAPI(
    title="Changxin Trader API",
    description="FastAPI backend for the Changxin Trader web trading application.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trader_router)


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
            "XtTraderPyApi sync query wrapper",
            "account assets, orders, deals and positions",
            "ordinary sync order and cancel endpoints",
        ],
    }
