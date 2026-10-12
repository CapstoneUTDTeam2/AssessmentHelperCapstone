from fastapi import FastAPI
from sqlalchemy import text

from app.api.evaluation_cycle import router as evaluation_cycle_router
from app.api.observer_requests import router as observer_request_router
from app.db import engine

app = FastAPI(title="Assessment Helper API")
app.include_router(observer_request_router)
app.include_router(evaluation_cycle_router)


@app.get("/health")
def health():
    """Liveness check. Says the API process is up, nothing more."""
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    """Readiness check. Proves the API can actually reach Postgres."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}
