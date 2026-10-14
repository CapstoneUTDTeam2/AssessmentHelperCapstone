from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.cycle_deadlines import campus_now, require_before_deadline, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["observee-signup"])

# AHC-226: one course per observee per cycle for now.
MAX_SIGNUPS_PER_CYCLE = 1

PROFESSOR_SQL = """
SELECT professorid, professorname
FROM Professors
WHERE professorid = :professor_id
"""

SECTION_SQL = """
SELECT s.sectionid, s.sectionname, s.termid, c.coursecode, c.coursename
FROM Sections s
JOIN Courses c ON s.CourseID = c.CourseID
WHERE s.SectionID = :section_id
"""

TEACHES_SQL = """
SELECT 1
FROM TeachingAssignment
WHERE ProfessorID = :professor_id
  AND SectionID = :section_id
"""

SIGNUP_COLUMNS = """
    os.signupid,
    os.cycleid,
    os.observeeprofessorid,
    p.professorname,
    os.sectionid,
    s.sectionname,
    c.coursecode,
    c.coursename,
    os.preferredtimes,
    os.signupdate,
    os.signuptime,
    os.status
"""

SIGNUP_FROM = """
FROM ObservationSignup os
JOIN Professors p ON os.ObserveeProfessorID = p.ProfessorID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
"""

EXISTING_SIGNUPS_SQL = f"""
SELECT {SIGNUP_COLUMNS}
{SIGNUP_FROM}
WHERE os.CycleID = :cycle_id
  AND os.ObserveeProfessorID = :professor_id
ORDER BY os.signupid
"""

SIGNUP_BY_ID_SQL = f"""
SELECT {SIGNUP_COLUMNS}
{SIGNUP_FROM}
WHERE os.SignupID = :signup_id
"""

# SignupID has no default in the DDL.
NEXT_SIGNUP_ID_SQL = "SELECT COALESCE(MAX(SignupID), 0) + 1 AS next_id FROM ObservationSignup"

# Stops two signups at the same time from both getting through.
LOCK_SIGNUPS_SQL = "LOCK TABLE ObservationSignup IN SHARE ROW EXCLUSIVE MODE"

INSERT_SIGNUP_SQL = """
INSERT INTO ObservationSignup (
    SignupID, CycleID, ObserveeProfessorID, SectionID,
    PreferredTimes, SignupDate, SignupTime, Status
)
VALUES (
    :signup_id, :cycle_id, :professor_id, :section_id,
    :preferred_times, :signup_date, :signup_time, 'Pending'
)
"""

# AHC-227: the pool is everyone who signed up this cycle. Course level = first digit * 1000.
OBSERVER_POOL_SQL = """
SELECT
    p.professorid,
    p.professorname,
    p.currentlevel,
    d.departmentid,
    d.departmentname,
    ARRAY(
        SELECT DISTINCT
            CAST(SUBSTRING(c2.CourseCode FROM '[0-9]') AS INTEGER) * 1000
        FROM TeachingAssignment ta2
        JOIN Sections s2 ON ta2.SectionID = s2.SectionID
        JOIN Courses c2 ON s2.CourseID = c2.CourseID
        WHERE ta2.ProfessorID = p.ProfessorID
          AND s2.TermID = :term_id
          AND SUBSTRING(c2.CourseCode FROM '[0-9]') IS NOT NULL
        ORDER BY 1
    ) AS courselevels
FROM Professors p
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
WHERE EXISTS (
    SELECT 1
    FROM ObservationSignup os
    WHERE os.ObserveeProfessorID = p.ProfessorID
      AND os.CycleID = :cycle_id
)
ORDER BY p.professorname
"""


class SignupRequest(BaseModel):
    professor_id: int
    section_id: int
    preferred_times: str | None = None
    cycle_id: int | None = None


def _today():
    return campus_now().date()


def _time_str(value):
    if value is None:
        return None
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _signup_payload(row):
    signup_date = row["signupdate"]
    return {
        "signup_id": row["signupid"],
        "cycle_id": row["cycleid"],
        "professor_id": row["observeeprofessorid"],
        "professor_name": row["professorname"],
        "section_id": row["sectionid"],
        "section_name": row["sectionname"],
        "course_code": row["coursecode"],
        "course_name": row["coursename"],
        "preferred_times": row["preferredtimes"],
        "signup_date": signup_date.isoformat() if signup_date else None,
        "signup_time": _time_str(row["signuptime"]),
        "status": row["status"],
    }


def _require_professor(conn, professor_id):
    row = conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Professor not found")
    return row


def _db_error_message(error):
    original = getattr(error, "orig", None)
    message = str(original if original is not None else error)
    return message.splitlines()[0]


# What: observee signs up for one section they teach (AHC-224, AHC-226, AHC-227).
@router.post("/signups", status_code=201)
def create_signup(request: SignupRequest):
    # Input: professor_id, section_id, optional preferred_times, optional cycle_id
    # Output: the new signup
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_SIGNUPS_SQL))

            cycle = resolve_cycle(conn, request.cycle_id)
            _require_professor(conn, request.professor_id)

            section = conn.execute(
                text(SECTION_SQL), {"section_id": request.section_id}
            ).mappings().first()
            if section is None:
                raise HTTPException(status_code=404, detail="Section not found")
            if section["termid"] != cycle["termid"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Section {request.section_id} is not in the "
                        f"{cycle['semester']} {cycle['yearnum']} evaluation cycle"
                    ),
                )

            teaches = conn.execute(
                text(TEACHES_SQL),
                {"professor_id": request.professor_id, "section_id": request.section_id},
            ).first()
            if teaches is None:
                raise HTTPException(
                    status_code=400,
                    detail="Professor can only sign up for a section they teach",
                )

            today = _today()
            require_before_deadline(cycle, "signup", today)

            existing = conn.execute(
                text(EXISTING_SIGNUPS_SQL),
                {"cycle_id": cycle["cycleid"], "professor_id": request.professor_id},
            ).mappings().all()
            if len(existing) >= MAX_SIGNUPS_PER_CYCLE:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": (
                            "Observee already signed up for a course this cycle. "
                            f"Limit is {MAX_SIGNUPS_PER_CYCLE} per cycle."
                        ),
                        "existing_signup": _signup_payload(existing[0]),
                    },
                )

            signup_id = conn.execute(text(NEXT_SIGNUP_ID_SQL)).scalar_one()
            conn.execute(
                text(INSERT_SIGNUP_SQL),
                {
                    "signup_id": signup_id,
                    "cycle_id": cycle["cycleid"],
                    "professor_id": request.professor_id,
                    "section_id": request.section_id,
                    "preferred_times": request.preferred_times,
                    "signup_date": today,
                    "signup_time": campus_now().time().replace(microsecond=0),
                },
            )
            created = conn.execute(
                text(SIGNUP_BY_ID_SQL), {"signup_id": signup_id}
            ).mappings().first()
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error_message(error))

    return {**_signup_payload(created), "in_observer_pool": True}


# What: the observee's signup for the cycle.
@router.get("/observees/{professor_id}/signup")
def get_observee_signup(
    professor_id: int,
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: professor_id, optional cycle_id
    # Output: their signup, or 404 if none
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        _require_professor(conn, professor_id)
        rows = conn.execute(
            text(EXISTING_SIGNUPS_SQL),
            {"cycle_id": cycle["cycleid"], "professor_id": professor_id},
        ).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No signup for this cycle")
    return _signup_payload(rows[0])


# What: observer pool for the cycle (AHC-227).
@router.get("/observer-pool")
def list_observer_pool(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: optional cycle_id
    # Output: pool members with department and course levels
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        rows = conn.execute(
            text(OBSERVER_POOL_SQL),
            {"cycle_id": cycle["cycleid"], "term_id": cycle["termid"]},
        ).mappings().all()
    return {
        "cycle_id": cycle["cycleid"],
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "observers": [
            {
                "professor_id": row["professorid"],
                "name": row["professorname"],
                "current_level": row["currentlevel"],
                "department_id": row["departmentid"],
                "department_name": row["departmentname"],
                "course_levels": list(row["courselevels"] or []),
            }
            for row in rows
        ],
    }
