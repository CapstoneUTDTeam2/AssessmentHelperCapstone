from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db import engine
from app.services.evaluation_cycle import evaluation_status

router = APIRouter(prefix="/api", tags=["evaluation-cycle"])

CURRENT_CYCLE_SQL = """
SELECT at.Semester, at.YearNum
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE at.Semester IN ('Spring', 'Fall')
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Fall' THEN 2 END DESC
LIMIT 1
"""

PROFESSOR_SQL = """
SELECT
    p.ProfessorID,
    p.ProfessorName,
    p.CurrentLevel,
    st.Semester AS StartSemester,
    st.YearNum AS StartYear,
    MAX(o.CompletedDate) AS LastEvaluationDate
FROM Professors p
LEFT JOIN AcademicTerm st ON p.StartTermID = st.TermID
LEFT JOIN Observation o
    ON o.ObserveeID = p.ProfessorID
    AND o.Status = 'Completed'
    AND o.CompletedDate IS NOT NULL
WHERE (CAST(:professor_id AS INTEGER) IS NULL OR p.ProfessorID = CAST(:professor_id AS INTEGER))
GROUP BY
    p.ProfessorID,
    p.ProfessorName,
    p.CurrentLevel,
    st.Semester,
    st.YearNum
ORDER BY p.ProfessorName
"""


def _load_current_cycle():
    with engine.connect() as conn:
        row = conn.execute(text(CURRENT_CYCLE_SQL)).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No evaluation cycle found")
    return {"semester": row["semester"], "year": row["yearnum"]}


def _status_payload(row, current_year, current_semester):
    result = evaluation_status(
        current_year=current_year,
        current_semester=current_semester,
        current_level=row["currentlevel"],
        start_year=row["startyear"],
        start_semester=row["startsemester"],
        last_evaluation_date=row["lastevaluationdate"],
    )
    last_eval = result["last_evaluation_date"]
    return {
        "professor_id": row["professorid"],
        "name": row["professorname"],
        "current_level": row["currentlevel"],
        "frequency_years": result["frequency_years"],
        "last_evaluation_date": last_eval.isoformat() if last_eval else None,
        "next_due_year": result["next_due_year"],
        "next_due_semester": result["next_due_semester"],
        "status": result["status"],
    }


# What: list every professor's evaluation-cycle status for the current cycle.
@router.get("/evaluation-status")
def list_evaluation_status():
    # Input: none; uses the latest Spring/Fall EvaluationCycle
    # Output: current term plus each professor's Due / Overdue / Not Due status
    current = _load_current_cycle()
    with engine.connect() as conn:
        rows = conn.execute(text(PROFESSOR_SQL), {"professor_id": None}).mappings().all()
    return {
        "current_term": current,
        "professors": [
            _status_payload(row, current["year"], current["semester"]) for row in rows
        ],
    }


# What: return one professor's evaluation-cycle status for the current cycle.
@router.get("/evaluation-status/{professor_id}")
def get_evaluation_status(professor_id: int):
    # Input: professor_id
    # Output: that professor's frequency, last eval, next due term, and status
    current = _load_current_cycle()
    with engine.connect() as conn:
        row = conn.execute(
            text(PROFESSOR_SQL), {"professor_id": professor_id}
        ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Faculty {professor_id} not found")
    return {
        "current_term": current,
        **_status_payload(row, current["year"], current["semester"]),
    }
