from datetime import date, time

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.api.cycle_deadlines import campus_now, require_before_deadline, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["observer-availability"])

# Same letters ObserverAvailability allows (R is Thursday).
WEEKDAYS = ("M", "T", "W", "R", "F")
WEEKDAY_NAMES = {"M": "Monday", "T": "Tuesday", "W": "Wednesday", "R": "Thursday", "F": "Friday"}

PROFESSOR_SQL = "SELECT professorid, professorname FROM Professors WHERE professorid = :professor_id"

ENROLLMENT_SQL = """
SELECT status
FROM ObserverEnrollment
WHERE ProfessorID = :professor_id
  AND CycleID = :cycle_id
"""

WEEKLY_SQL = """
SELECT weekday, starttime, endtime
FROM ObserverAvailability
WHERE ProfessorID = :professor_id
  AND CycleID = :cycle_id
ORDER BY POSITION(weekday IN 'MTWRF')
"""

UNAVAILABLE_SQL = """
SELECT unavailabledate
FROM ObserverUnavailableDate
WHERE ProfessorID = :professor_id
  AND CycleID = :cycle_id
ORDER BY unavailabledate
"""

DELETE_WEEKLY_SQL = "DELETE FROM ObserverAvailability WHERE ProfessorID = :professor_id AND CycleID = :cycle_id"
DELETE_UNAVAILABLE_SQL = "DELETE FROM ObserverUnavailableDate WHERE ProfessorID = :professor_id AND CycleID = :cycle_id"

INSERT_WEEKLY_SQL = """
INSERT INTO ObserverAvailability (ProfessorID, CycleID, Weekday, StartTime, EndTime)
VALUES (:professor_id, :cycle_id, :weekday, :start_time, :end_time)
"""

INSERT_UNAVAILABLE_SQL = """
INSERT INTO ObserverUnavailableDate (ProfessorID, CycleID, UnavailableDate)
VALUES (:professor_id, :cycle_id, :unavailable_date)
"""

# Entering availability means the professor wants to observe, so they join the pool if they aren't in it.
ENROLL_SQL = """
INSERT INTO ObserverEnrollment (ProfessorID, CycleID)
VALUES (:professor_id, :cycle_id)
ON CONFLICT (ProfessorID, CycleID) DO NOTHING
"""


class WeeklySlot(BaseModel):
    weekday: str
    start_time: time
    end_time: time


class AvailabilityRequest(BaseModel):
    weekly: list[WeeklySlot] = []
    unavailable_dates: list[date] = []
    cycle_id: int | None = None


def _time_str(value):
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _require_professor(conn, professor_id):
    row = conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Professor not found")
    return row


def _availability_payload(conn, professor, cycle):
    params = {"professor_id": professor["professorid"], "cycle_id": cycle["cycleid"]}
    enrollment = conn.execute(text(ENROLLMENT_SQL), params).first()
    weekly = conn.execute(text(WEEKLY_SQL), params).mappings().all()
    unavailable = conn.execute(text(UNAVAILABLE_SQL), params).scalars().all()
    return {
        "professor_id": professor["professorid"],
        "professor_name": professor["professorname"],
        "cycle_id": cycle["cycleid"],
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "enrollment_status": enrollment[0] if enrollment else None,
        "weekly": [
            {
                "weekday": row["weekday"],
                "weekday_name": WEEKDAY_NAMES[row["weekday"]],
                "start_time": _time_str(row["starttime"]),
                "end_time": _time_str(row["endtime"]),
            }
            for row in weekly
        ],
        "unavailable_dates": [d.isoformat() for d in unavailable],
    }


def _check_request(request, cycle, today):
    seen = set()
    for slot in request.weekly:
        day = slot.weekday.strip().upper()
        if day not in WEEKDAYS:
            raise HTTPException(status_code=400, detail=f"Weekday must be one of M, T, W, R, F, not {slot.weekday}")
        if day in seen:
            raise HTTPException(status_code=400, detail=f"{WEEKDAY_NAMES[day]} is listed more than once")
        if slot.start_time >= slot.end_time:
            raise HTTPException(status_code=400, detail=f"{WEEKDAY_NAMES[day]} start time must be before end time")
        seen.add(day)
        slot.weekday = day
    deadline = cycle["observationdeadline"]
    for unavailable in request.unavailable_dates:
        if unavailable < today:
            raise HTTPException(status_code=400, detail=f"Unavailable date {unavailable} is in the past")
        if unavailable > deadline:
            raise HTTPException(
                status_code=400,
                detail=f"Unavailable date {unavailable} is after the observation deadline {deadline}",
            )


# What: a professor's weekly observing availability and days off for the cycle.
@router.get("/observers/{professor_id}/availability")
def get_observer_availability(
    professor_id: int,
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: professor_id, optional cycle_id
    # Output: weekly time slots, unavailable dates, and observer enrollment status
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        professor = _require_professor(conn, professor_id)
        return _availability_payload(conn, professor, cycle)


# What: set a professor's weekly observing availability and days off (replaces what was there).
@router.put("/observers/{professor_id}/availability")
def set_observer_availability(professor_id: int, request: AvailabilityRequest):
    # Input: weekly [{weekday M/T/W/R/F, start_time, end_time}], unavailable_dates, optional cycle_id
    # Output: the saved availability
    today = campus_now().date()
    with engine.begin() as conn:
        cycle = resolve_cycle(conn, request.cycle_id)
        professor = _require_professor(conn, professor_id)
        require_before_deadline(cycle, "observation", today)
        _check_request(request, cycle, today)

        params = {"professor_id": professor_id, "cycle_id": cycle["cycleid"]}
        conn.execute(text(DELETE_WEEKLY_SQL), params)
        conn.execute(text(DELETE_UNAVAILABLE_SQL), params)
        for slot in request.weekly:
            conn.execute(
                text(INSERT_WEEKLY_SQL),
                {**params, "weekday": slot.weekday, "start_time": slot.start_time, "end_time": slot.end_time},
            )
        for unavailable in sorted(set(request.unavailable_dates)):
            conn.execute(text(INSERT_UNAVAILABLE_SQL), {**params, "unavailable_date": unavailable})
        conn.execute(text(ENROLL_SQL), params)
        return _availability_payload(conn, professor, cycle)
