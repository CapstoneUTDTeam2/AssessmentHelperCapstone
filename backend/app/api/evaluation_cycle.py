from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db import engine

router = APIRouter(prefix="/api", tags=["evaluation-cycle"])

# Status comes from Databasing/ProfEvalStat.sql (AHC-218). Do not recompute here.
STATUS_SQL = """
SELECT
    professorid,
    professorname,
    currentlevel,
    frequencyyears,
    lastevaluationdate,
    nextdueyear,
    nextduesemester,
    evaluationstatus
FROM ProfessorEvaluationStatus
WHERE (
    CAST(:professor_id AS INTEGER) IS NULL
    OR professorid = CAST(:professor_id AS INTEGER)
)
ORDER BY professorname
"""

CURRENT_CYCLE_SQL = """
SELECT at.Semester, at.YearNum
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE at.Semester IN ('Spring', 'Fall')
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Fall' THEN 2 END DESC
LIMIT 1
"""


def _load_current_cycle():
    with engine.connect() as conn:
        row = conn.execute(text(CURRENT_CYCLE_SQL)).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No evaluation cycle found")
    return {"semester": row["semester"], "year": row["yearnum"]}


def _status_payload(row):
    last_eval = row["lastevaluationdate"]
    return {
        "professor_id": row["professorid"],
        "name": row["professorname"],
        "current_level": row["currentlevel"],
        "frequency_years": row["frequencyyears"],
        "last_evaluation_date": last_eval.isoformat() if last_eval else None,
        "next_due_year": row["nextdueyear"],
        "next_due_semester": row["nextduesemester"],
        "status": row["evaluationstatus"],
    }


# What: list every professor's evaluation-cycle status from ProfessorEvaluationStatus.
@router.get("/evaluation-status")
def list_evaluation_status():
    # Input: none
    # Output: current term plus each row from the SQL view
    current = _load_current_cycle()
    with engine.connect() as conn:
        rows = conn.execute(text(STATUS_SQL), {"professor_id": None}).mappings().all()
    return {
        "current_term": current,
        "professors": [_status_payload(row) for row in rows],
    }


# What: return one professor's evaluation-cycle status from ProfessorEvaluationStatus.
@router.get("/evaluation-status/{professor_id}")
def get_evaluation_status(professor_id: int):
    # Input: professor_id
    # Output: that professor's row from the SQL view
    current = _load_current_cycle()
    with engine.connect() as conn:
        row = conn.execute(
            text(STATUS_SQL), {"professor_id": professor_id}
        ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Faculty {professor_id} not found")
    return {
        "current_term": current,
        **_status_payload(row),
    }
