from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.db import engine

router = APIRouter(prefix="/api", tags=["evaluation-cycle-deadlines"])

# Deadlines in the order the cycle moves through them.
DEADLINES = [
    ("signup", "signupdeadline", "signup"),
    ("observation", "observationdeadline", "observation"),
    ("post_observation_feedback", "postobservationfeedbackdeadline", "post-observation feedback"),
    ("app_feedback", "appfeedbackdeadline", "app feedback"),
]
DEADLINE_COLUMNS = {key: column for key, column, _ in DEADLINES}
DEADLINE_LABELS = {key: label for key, _, label in DEADLINES}

# Current cycle is the latest Spring/Fall EvaluationCycle term.
CURRENT_CYCLE_SQL = """
SELECT ec.cycleid
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE at.Semester IN ('Spring', 'Fall')
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Fall' THEN 2 END DESC
LIMIT 1
"""

CYCLE_COLUMNS = """
    ec.cycleid,
    ec.termid,
    at.semester,
    at.yearnum,
    ec.signupdeadline,
    ec.observationdeadline,
    ec.postobservationfeedbackdeadline,
    ec.appfeedbackdeadline
"""

CYCLE_SQL = f"""
SELECT {CYCLE_COLUMNS}
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE ec.CycleID = :cycle_id
"""

ALL_CYCLES_SQL = f"""
SELECT {CYCLE_COLUMNS}
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Summer' THEN 2 WHEN 'Fall' THEN 3 END DESC
"""

UPDATE_DEADLINES_SQL = """
UPDATE EvaluationCycle
SET SignUpDeadLine = :signup,
    ObservationDeadLine = :observation,
    PostObservationFeedbackDeadLine = :post_observation_feedback,
    AppFeedbackDeadLine = :app_feedback
WHERE CycleID = :cycle_id
"""


class DeadlineUpdate(BaseModel):
    signup: date | None = None
    observation: date | None = None
    post_observation_feedback: date | None = None
    app_feedback: date | None = None


# Use the Dallas date, not the server clock (Docker runs on UTC).
CAMPUS_TIMEZONE = "America/Chicago"
CAMPUS_NOW_SQL = "SELECT (now() AT TIME ZONE :tz) AS campus_now"

# Test harness only. Not a product table; created on first clock read/write.
ENSURE_CLOCK_SQL = """
CREATE TABLE IF NOT EXISTS testharnessclock (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    frozen_at TIMESTAMP WITHOUT TIME ZONE NOT NULL
)
"""
CLOCK_GET_SQL = "SELECT frozen_at FROM testharnessclock WHERE singleton IS TRUE"
CLOCK_SET_SQL = """
INSERT INTO testharnessclock (singleton, frozen_at)
VALUES (TRUE, :frozen_at)
ON CONFLICT (singleton) DO UPDATE SET frozen_at = EXCLUDED.frozen_at
"""
CLOCK_CLEAR_SQL = "DELETE FROM testharnessclock"


def campus_now():
    # Input: none (optional testharnessclock.frozen_at)
    # Output: America/Chicago now, or the frozen tester clock
    with engine.begin() as conn:
        conn.execute(text(ENSURE_CLOCK_SQL))
        frozen = conn.execute(text(CLOCK_GET_SQL)).scalar()
        if frozen is not None:
            return frozen
        return conn.execute(text(CAMPUS_NOW_SQL), {"tz": CAMPUS_TIMEZONE}).scalar_one()


def set_campus_clock(frozen_at):
    # Input: naive datetime in America/Chicago, or None to follow the real clock
    # Output: campus_now() after the change
    with engine.begin() as conn:
        conn.execute(text(ENSURE_CLOCK_SQL))
        if frozen_at is None:
            conn.execute(text(CLOCK_CLEAR_SQL))
        else:
            conn.execute(text(CLOCK_SET_SQL), {"frozen_at": frozen_at.replace(microsecond=0)})
    return campus_now()


def _today():
    return campus_now().date()


def resolve_cycle(conn, cycle_id=None):
    if cycle_id is None:
        row = conn.execute(text(CURRENT_CYCLE_SQL)).mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="No evaluation cycle found")
        cycle_id = row["cycleid"]
    cycle = conn.execute(text(CYCLE_SQL), {"cycle_id": cycle_id}).mappings().first()
    if cycle is None:
        raise HTTPException(status_code=404, detail=f"Evaluation cycle {cycle_id} not found")
    return cycle


def is_before_deadline(cycle, deadline_key, on_date):
    return on_date <= cycle[DEADLINE_COLUMNS[deadline_key]]


def dates_before_deadline(cycle, deadline_key, dates):
    return all(is_before_deadline(cycle, deadline_key, d) for d in dates)


def require_before_deadline(cycle, deadline_key, on_date):
    if not is_before_deadline(cycle, deadline_key, on_date):
        deadline = cycle[DEADLINE_COLUMNS[deadline_key]]
        raise HTTPException(
            status_code=400,
            detail=(
                f"The {DEADLINE_LABELS[deadline_key]} deadline for this cycle "
                f"was {deadline.isoformat()}"
            ),
        )


def current_phase(cycle, today):
    for key, column, _ in DEADLINES:
        if today <= cycle[column]:
            return key
    return "closed"


def cycle_payload(cycle, today):
    deadlines = []
    for key, column, label in DEADLINES:
        deadline = cycle[column]
        deadlines.append(
            {
                "key": key,
                "label": label,
                "date": deadline.isoformat(),
                "is_open": today <= deadline,
                "days_left": (deadline - today).days,
            }
        )
    upcoming = sorted(
        (d for d in deadlines if d["is_open"]), key=lambda d: d["date"]
    )
    return {
        "cycle_id": cycle["cycleid"],
        "term_id": cycle["termid"],
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "today": today.isoformat(),
        "phase": current_phase(cycle, today),
        "next_deadline": upcoming[0] if upcoming else None,
        "deadlines": deadlines,
    }


def _validate_order(dates):
    # Same order rules as the DDL constraints.
    if dates["signup"] > dates["observation"]:
        return "Signup deadline must be on or before the observation deadline"
    if dates["observation"] > dates["post_observation_feedback"]:
        return "Observation deadline must be on or before the post-observation feedback deadline"
    if dates["app_feedback"] < dates["observation"]:
        return "App feedback deadline must be on or after the observation deadline"
    return None


# What: every evaluation cycle with its deadlines and phase.
@router.get("/evaluation-cycles")
def list_evaluation_cycles():
    # Input: none
    # Output: cycles, newest first
    today = _today()
    with engine.connect() as conn:
        rows = conn.execute(text(ALL_CYCLES_SQL)).mappings().all()
    return {"cycles": [cycle_payload(row, today) for row in rows]}


# What: current cycle's deadlines, which are open, and the phase.
@router.get("/evaluation-cycles/current")
def get_current_evaluation_cycle():
    # Input: none
    # Output: current cycle with deadlines and phase
    with engine.connect() as conn:
        cycle = resolve_cycle(conn)
    return cycle_payload(cycle, _today())


# What: one cycle's deadlines and phase.
@router.get("/evaluation-cycles/{cycle_id}")
def get_evaluation_cycle(cycle_id: int):
    # Input: cycle_id
    # Output: that cycle with deadlines and phase
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
    return cycle_payload(cycle, _today())


# What: set or extend a cycle's deadlines. Dates not sent stay the same.
@router.put("/evaluation-cycles/{cycle_id}/deadlines")
def update_evaluation_cycle_deadlines(cycle_id: int, update: DeadlineUpdate):
    # Input: cycle_id, any of signup/observation/post_observation_feedback/app_feedback
    # Output: the updated cycle
    changes = update.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No deadlines were provided")

    try:
        with engine.begin() as conn:
            cycle = resolve_cycle(conn, cycle_id)
            new_dates = {key: cycle[column] for key, column, _ in DEADLINES}
            new_dates.update(changes)

            problem = _validate_order(new_dates)
            if problem:
                raise HTTPException(status_code=400, detail=problem)

            conn.execute(text(UPDATE_DEADLINES_SQL), {**new_dates, "cycle_id": cycle_id})
            updated = resolve_cycle(conn, cycle_id)
    except DBAPIError as error:
        original = getattr(error, "orig", None)
        message = str(original if original is not None else error).splitlines()[0]
        raise HTTPException(status_code=400, detail=message)

    return cycle_payload(updated, _today())
