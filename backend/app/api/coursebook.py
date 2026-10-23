# What: pull CourseBook (Nebula Labs) into the source-backed tables.
import os
import sys
from pathlib import Path

import psycopg
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.db import engine

router = APIRouter(prefix="/api", tags=["coursebook"])

CURRENT_TERM_SQL = """
SELECT at.semester, at.yearnum
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE at.Semester IN ('Spring', 'Fall')
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Fall' THEN 2 END DESC
LIMIT 1
"""

SEMESTER_CODE = {"Fall": "F", "Spring": "S", "Summer": "U"}


class CourseBookImport(BaseModel):
    term: str
    prefix: str
    courses: int
    sections: int
    professors: int
    assignments: int


def _ingest_dir() -> Path:
    mounted = Path("/ingest")
    if (mounted / "ingest.py").is_file():
        return mounted
    return Path(__file__).resolve().parents[3] / "NebulaLabsIntegration"


def _load_ingest():
    ingest_dir = _ingest_dir()
    if not (ingest_dir / "ingest.py").is_file():
        raise HTTPException(
            status_code=500,
            detail="Nebula ingest module is not available on this server",
        )
    sys.path.insert(0, str(ingest_dir))
    import ingest as nebula_ingest

    return nebula_ingest


def _psycopg_url(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def _nebula_term(semester: str, year: int) -> str:
    code = SEMESTER_CODE.get(semester)
    if not code:
        raise HTTPException(status_code=400, detail=f"Unsupported semester {semester}")
    return f"{year % 100:02d}{code}"


def _current_term():
    with engine.connect() as conn:
        row = conn.execute(text(CURRENT_TERM_SQL)).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No evaluation cycle is loaded")
    return row["semester"], row["yearnum"]


def _require_keys():
    missing = [
        name
        for name in ("NEBULALABS_API_KEY", "ANONYMIZATION_KEY")
        if not os.environ.get(name) or os.environ[name].startswith("replace-with")
    ]
    if missing:
        raise HTTPException(
            status_code=503,
            detail="CourseBook pull is not configured: set " + ", ".join(missing) + " in .env",
        )


# What: upsert CourseBook rows for one subject and term.
@router.post("/coursebook/ingest", response_model=CourseBookImport)
def ingest_coursebook(
    prefix: str = Query(default="CS", description="Course subject prefix"),
    term: str | None = Query(default=None, description="Nebula term such as 26F; defaults to the current cycle"),
):
    # Input: optional prefix and term
    # Output: counts written, or existing data is left unchanged on failure
    _require_keys()
    nebula_ingest = _load_ingest()
    if not term:
        semester, year = _current_term()
        term = _nebula_term(semester, year)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is not set")
    try:
        data = nebula_ingest.collect(
            nebula_ingest.NebulaClient(os.environ["NEBULALABS_API_KEY"]),
            prefix.upper(),
            term,
            os.environ["ANONYMIZATION_KEY"],
        )
        nebula_ingest.check_id_collisions(data)
        with psycopg.connect(_psycopg_url(database_url)) as conn:
            nebula_ingest.write(conn, data)
    except nebula_ingest.IngestionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CourseBookImport(
        term=term,
        prefix=prefix.upper(),
        courses=len(data.courses),
        sections=len(data.sections),
        professors=len(data.professors),
        assignments=len(data.assignments),
    )
