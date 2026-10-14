import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.cycle_deadlines import router as cycle_deadlines_router
from app.api.evaluation_cycle import router as evaluation_cycle_router
from app.api.observee_classes import router as observee_classes_router
from app.api.observee_signup import router as observee_signup_router
from app.api.observer_requests import router as observer_request_router
from app.db import engine

app = FastAPI(title="Assessment Helper API")

# Lets the React frontend (port 5173) call the API.
CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(observer_request_router)
app.include_router(evaluation_cycle_router)
app.include_router(observee_classes_router)
app.include_router(observee_signup_router)
app.include_router(cycle_deadlines_router)


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
