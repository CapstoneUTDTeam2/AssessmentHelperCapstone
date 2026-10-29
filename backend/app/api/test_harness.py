# Test-only routes so a local tester can freeze campus time, fill Unknown
# professors, and walk signup → match → invite → accept. Not a process role.

import random
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.api.cycle_deadlines import campus_now, cycle_payload, resolve_cycle, set_campus_clock
from app.api.observee_signup import WEEKDAY_LETTERS, _check_preferred_dates
from app.api.observer_matching import course_level, is_busy, parse_clock, parse_days
from app.db import engine

router = APIRouter(prefix="/api/test", tags=["test-harness"])

# Same labels ProfessorEvaluationStatus uses for yearly vs every-2-year due.
ALLOWED_LEVELS = ("Assistant Professor", "Associate Professor", "Full Professor")

TERMS_SQL = """
SELECT termid, semester, yearnum
FROM AcademicTerm
ORDER BY yearnum,
    CASE semester WHEN 'Spring' THEN 1 WHEN 'Summer' THEN 2 WHEN 'Fall' THEN 3 ELSE 4 END
"""

PROFESSOR_GET_SQL = """
SELECT professorid, professorname, currentlevel, starttermid, email, isac
FROM Professors
WHERE professorid = :professor_id
"""

PROFESSOR_UPDATE_SQL = """
UPDATE Professors
SET CurrentLevel = :current_level,
    StartTermID = :start_term_id
WHERE ProfessorID = :professor_id
"""


class ClockBody(BaseModel):
    # America/Chicago wall time. Null clears the override.
    frozen_at: datetime | None = None


class ProfessorBody(BaseModel):
    current_level: str | None = None


def _clock_payload():
    now = campus_now().replace(microsecond=0)
    with engine.begin() as conn:
        frozen = conn.execute(text("SELECT frozen_at FROM testharnessclock WHERE singleton IS TRUE")).scalar()
    return {
        "now": now.isoformat(timespec="seconds"),
        "frozen": frozen is not None,
        "timezone": "America/Chicago",
    }


def _professor_payload(row):
    return {
        "professor_id": row["professorid"],
        "name": row["professorname"],
        "current_level": row["currentlevel"],
        "start_term_id": row["starttermid"],
        "email": row["email"],
        "is_ac": bool(row["isac"]) if row["isac"] is not None else False,
    }


# What: Dallas clock the APIs use for deadline phases, plus current cycle and terms.
@router.get("/harness")
def get_harness():
    # Input: none
    # Output: clock, current cycle, AcademicTerm rows, allowed ranks
    clock = _clock_payload()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn)
        terms = conn.execute(text(TERMS_SQL)).mappings().all()
    return {
        **clock,
        "current_cycle": cycle_payload(cycle, campus_now().date()),
        "ranks": list(ALLOWED_LEVELS),
        "terms": [
            {
                "term_id": row["termid"],
                "semester": row["semester"],
                "year": row["yearnum"],
            }
            for row in terms
        ],
    }


# What: freeze or clear the campus clock used by deadline/signup/request APIs.
@router.put("/clock")
def put_clock(body: ClockBody):
    # Input: frozen_at datetime, or null to follow America/Chicago now
    # Output: clock after the change
    # Due/Overdue still come from ProfessorEvaluationStatus vs the current
    # EvaluationCycle term, not this clock.
    set_campus_clock(body.frozen_at)
    return _clock_payload()


# What: set Professors.CurrentLevel. StartTermID is derived from last eval.
@router.put("/professors/{professor_id}")
def put_professor(professor_id: int, body: ProfessorBody):
    # Input: professor_id, optional current_level
    # Output: that professor row
    # Process: Assistant yearly, Associate/Full every 2 years. Start term is
    # the Spring/Fall term before last evaluation (or before the current
    # cycle if there is none). Testers pick rank, not start term.
    if body.current_level is not None and body.current_level not in ALLOWED_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"current_level must be one of: {', '.join(ALLOWED_LEVELS)}",
        )
    with engine.begin() as conn:
        row = conn.execute(text(PROFESSOR_GET_SQL), {"professor_id": professor_id}).mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Faculty {professor_id} not found")
        cycle = resolve_cycle(conn)
        level = body.current_level if "current_level" in body.model_fields_set else row["currentlevel"]
        last_eval = _as_date(_last_eval_date(conn, professor_id))
        start_term_id = _coerced_start_term_id(
            conn,
            row["starttermid"],
            last_eval,
            cycle["semester"],
            cycle["yearnum"],
        )
        conn.execute(
            text(PROFESSOR_UPDATE_SQL),
            {
                "professor_id": professor_id,
                "current_level": level,
                "start_term_id": start_term_id,
            },
        )
        updated = conn.execute(text(PROFESSOR_GET_SQL), {"professor_id": professor_id}).mappings().first()
    return _professor_payload(updated)


UNKNOWN_PROFESSORS_SQL = """
SELECT p.professorid, p.professorname, p.currentlevel, p.starttermid, p.professordepartment
FROM Professors p
JOIN ProfessorEvaluationStatus s ON s.professorid = p.professorid
WHERE s.evaluationstatus = 'Unknown'
ORDER BY p.professorname
"""

PAST_CYCLE_SQL = """
SELECT ec.cycleid, ec.termid, ec.templateid, at.semester, at.yearnum, ec.signupdeadline
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE at.Semester IN ('Spring', 'Fall')
  AND NOT (at.Semester = :semester AND at.YearNum = :year)
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Fall' THEN 2 END DESC
LIMIT 1
"""

PAST_SECTION_SQL = """
SELECT s.sectionid
FROM Sections s
JOIN Courses c ON c.CourseID = s.CourseID
JOIN TeachingAssignment ta ON ta.SectionID = s.SectionID
JOIN Professors p ON p.ProfessorID = ta.ProfessorID
WHERE s.TermID = :term_id
  AND p.ProfessorDepartment = :department_id
ORDER BY s.sectionid
LIMIT 1
"""

ANY_PAST_SECTION_SQL = """
SELECT s.sectionid FROM Sections s WHERE s.TermID = :term_id ORDER BY s.sectionid LIMIT 1
"""

OTHER_PROFESSOR_SQL = """
SELECT professorid FROM Professors
WHERE professorid <> :professor_id
  AND professordepartment = :department_id
ORDER BY professorid
LIMIT 1
"""

HAS_COMPLETED_SQL = """
SELECT 1 FROM Observation
WHERE ObserveeID = :professor_id AND Status = 'Completed' AND CompletedDate IS NOT NULL
LIMIT 1
"""

# Last-eval dates chosen so Assistant yearly / Associate-Full every 2 years produce
# Due, Overdue, and Not Due against a Fall 2026 current cycle.
LAST_EVAL_CHOICES = (
    ("Assistant Professor", date(2025, 10, 14)),  # next Fall 2026 → Due
    ("Assistant Professor", date(2025, 3, 15)),  # next Spring 2026 → Overdue
    ("Associate Professor", date(2024, 10, 14)),  # next Fall 2026 → Due
    ("Associate Professor", date(2025, 3, 15)),  # next Spring 2027 → Not Due
    ("Full Professor", date(2024, 3, 15)),  # next Spring 2026 → Overdue
)

LAST_EVAL_DATE_SQL = """
SELECT MAX(CompletedDate) FROM Observation
WHERE ObserveeID = :professor_id
  AND Status = 'Completed'
  AND CompletedDate IS NOT NULL
"""

ALL_PROFESSORS_SQL = """
SELECT professorid, currentlevel, starttermid FROM Professors
"""

CANDIDATES_SQL = """
SELECT DISTINCT p.professorid, p.professorname
FROM Professors p
JOIN TeachingAssignment ta ON ta.ProfessorID = p.ProfessorID
JOIN Sections s ON s.SectionID = ta.SectionID
JOIN AcademicTerm at ON s.TermID = at.TermID
WHERE at.Semester = :semester AND at.YearNum = :year
  AND NOT EXISTS (
      SELECT 1 FROM ObservationSignup os
      WHERE os.ObserveeProfessorID = p.ProfessorID AND os.CycleID = :cycle_id
  )
ORDER BY p.professorname
"""

CLASSES_SQL = """
SELECT c.courseid, c.coursecode, c.coursename, s.sectionid, s.sectionname,
       s.meetingdays, s.starttime, s.endtime
FROM TeachingAssignment ta
JOIN Sections s ON ta.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
JOIN AcademicTerm at ON s.TermID = at.TermID
WHERE ta.ProfessorID = :professor_id
  AND at.Semester = :semester AND at.YearNum = :year
ORDER BY c.coursecode, s.sectionname
"""

# Due this cycle, no signup yet, teaching a timed section this term.
DUE_UNSIGNED_CLASSES_SQL = """
SELECT
    p.professorid,
    p.professorname,
    p.professordepartment,
    d.departmentname,
    s.sectionid,
    s.sectionname,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.coursecode,
    c.coursename
FROM Professors p
JOIN ProfessorEvaluationStatus st ON st.ProfessorID = p.ProfessorID
JOIN Department d ON d.DepartmentID = p.ProfessorDepartment
JOIN TeachingAssignment ta ON ta.ProfessorID = p.ProfessorID
JOIN Sections s ON s.SectionID = ta.SectionID
JOIN Courses c ON c.CourseID = s.CourseID
JOIN AcademicTerm t ON t.TermID = s.TermID
WHERE st.EvaluationStatus = 'Due'
  AND t.Semester = :semester
  AND t.YearNum = :year
  AND s.StartTime IS NOT NULL
  AND s.EndTime IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM ObservationSignup os
      WHERE os.ObserveeProfessorID = p.ProfessorID
        AND os.CycleID = :cycle_id
  )
ORDER BY p.professorname, c.coursecode, s.sectionname
"""


class AdvanceBody(BaseModel):
    days: int = 3


class PreferredDatesBody(BaseModel):
    dates: list[date]


def _as_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def _term_key(semester, year):
    rank = 0 if semester == "Spring" else 1 if semester == "Fall" else 2
    return (year, rank)


def _term_from_date(completed_on: date):
    # Same month bands as ProfessorEvaluationStatus (1–5 Spring, 8–12 Fall).
    if 1 <= completed_on.month <= 5:
        return ("Spring", completed_on.year)
    if 8 <= completed_on.month <= 12:
        return ("Fall", completed_on.year)
    return ("Spring", completed_on.year)


def _previous_term(semester, year):
    if semester == "Spring":
        return ("Fall", year - 1)
    return ("Spring", year)


def _ensure_term(conn, semester, year):
    row = conn.execute(
        text("SELECT termid FROM AcademicTerm WHERE semester = :semester AND yearnum = :year"),
        {"semester": semester, "year": year},
    ).first()
    if row is not None:
        return row[0]
    next_id = conn.execute(text("SELECT COALESCE(MAX(termid), 0) + 1 FROM AcademicTerm")).scalar()
    conn.execute(
        text("INSERT INTO AcademicTerm (TermID, Semester, YearNum) VALUES (:term_id, :semester, :year)"),
        {"term_id": next_id, "semester": semester, "year": year},
    )
    return next_id


def _start_term_before(conn, last_eval, current_semester, current_year):
    # Hired before last evaluation, and not in the current cycle (that path is Not Due).
    if last_eval is not None:
        semester, year = _previous_term(*_term_from_date(last_eval))
    else:
        semester, year = _previous_term(current_semester, current_year)
    current_key = _term_key(current_semester, current_year)
    while _term_key(semester, year) >= current_key:
        semester, year = _previous_term(semester, year)
    return _ensure_term(conn, semester, year)


def _start_term_is_before(conn, start_term_id, last_eval, current_semester, current_year):
    if start_term_id is None:
        return False
    row = conn.execute(
        text("SELECT semester, yearnum FROM AcademicTerm WHERE termid = :term_id"),
        {"term_id": start_term_id},
    ).mappings().first()
    if row is None:
        return False
    start_key = _term_key(row["semester"], row["yearnum"])
    if start_key >= _term_key(current_semester, current_year):
        return False
    if last_eval is None:
        return True
    return start_key < _term_key(*_term_from_date(last_eval))


def _last_eval_date(conn, professor_id):
    return conn.execute(text(LAST_EVAL_DATE_SQL), {"professor_id": professor_id}).scalar()


def _coerced_start_term_id(conn, start_term_id, last_eval, current_semester, current_year):
    if _start_term_is_before(conn, start_term_id, last_eval, current_semester, current_year):
        return start_term_id
    return _start_term_before(conn, last_eval, current_semester, current_year)


def _time_str(value):
    if value is None:
        return None
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _meeting_letter_ok(meeting_days, letter):
    raw = meeting_days or ""
    compact = parse_days(raw)
    if letter not in compact:
        return False
    # CourseBook stores "Tuesday,Thursday"; the SQL eligibility function uses
    # POSITION(letter IN meetingdays), so R is missing from that string.
    return letter in raw


def next_class_dates(meeting_days, start, end, count=2):
    dates = []
    day = start
    while day <= end and len(dates) < count:
        letter = WEEKDAY_LETTERS.get(day.weekday())
        if letter and _meeting_letter_ok(meeting_days, letter):
            dates.append(day)
        day += timedelta(days=1)
    return dates


# Tester hours must cover late CourseBook sections (16:00–17:15, 17:30–18:45).
# Eligibility requires ObserverAvailability.EndTime >= the class end time.
TEST_AVAILABILITY_START = time(8, 0)
TEST_AVAILABILITY_END = time(19, 0)


def _sync_observer_pool_to_signups(conn, cycle_id):
    # Process: signing up to be observed puts you in the observer pool. The tester
    # does not enroll the rest of the faculty.
    conn.execute(
        text(
            """
            DELETE FROM ObserverEnrollment oe
            WHERE oe.CycleID = :cycle_id
              AND NOT EXISTS (
                  SELECT 1 FROM ObservationSignup os
                  WHERE os.ObserveeProfessorID = oe.ProfessorID
                    AND os.CycleID = oe.CycleID
              )
            """
        ),
        {"cycle_id": cycle_id},
    )
    conn.execute(
        text(
            """
            INSERT INTO ObserverEnrollment (ProfessorID, CycleID)
            SELECT DISTINCT os.ObserveeProfessorID, os.CycleID
            FROM ObservationSignup os
            WHERE os.CycleID = :cycle_id
            ON CONFLICT (ProfessorID, CycleID) DO NOTHING
            """
        ),
        {"cycle_id": cycle_id},
    )
    # Hours left from an older seed still apply after someone signs up. Stretch 8–5
    # to 8–7 so late CourseBook sections can match.
    conn.execute(
        text(
            """
            UPDATE ObserverAvailability
            SET EndTime = :end_time
            WHERE CycleID = :cycle_id
              AND StartTime = :start_time
              AND EndTime = TIME '17:00'
            """
        ),
        {
            "cycle_id": cycle_id,
            "start_time": TEST_AVAILABILITY_START,
            "end_time": TEST_AVAILABILITY_END,
        },
    )
    missing = conn.execute(
        text(
            """
            SELECT oe.professorid
            FROM ObserverEnrollment oe
            WHERE oe.cycleid = :cycle_id AND oe.status = 'Active'
              AND NOT EXISTS (
                  SELECT 1 FROM ObserverAvailability oa
                  WHERE oa.ProfessorID = oe.ProfessorID AND oa.CycleID = oe.CycleID
              )
            """
        ),
        {"cycle_id": cycle_id},
    ).scalars().all()
    for professor_id in missing:
        for weekday in "MTWRF":
            conn.execute(
                text(
                    """
                    INSERT INTO ObserverAvailability (ProfessorID, CycleID, Weekday, StartTime, EndTime)
                    VALUES (:professor_id, :cycle_id, :weekday, :start_time, :end_time)
                    """
                ),
                {
                    "professor_id": professor_id,
                    "cycle_id": cycle_id,
                    "weekday": weekday,
                    "start_time": TEST_AVAILABILITY_START,
                    "end_time": TEST_AVAILABILITY_END,
                },
            )
    remaining = conn.execute(
        text("SELECT COUNT(*) FROM ObserverEnrollment WHERE CycleID = :cycle_id"),
        {"cycle_id": cycle_id},
    ).scalar()
    return remaining or 0


def _clear_current_cycle_process(conn, cycle_id):
    # Remove this cycle's signups, requests, surveys, and any observation that is
    # not a completed past evaluation. Testers walk the current cycle by hand.
    conn.execute(text("SET LOCAL session_replication_role = 'replica'"))
    current_obs = """
        SELECT o.ObservationID
        FROM Observation o
        JOIN ObservationSignup os ON os.SignupID = o.SignupID
        WHERE os.CycleID = :cycle_id
           OR COALESCE(o.Status, '') <> 'Completed'
    """
    ratings = conn.execute(
        text(f"DELETE FROM ObservationCriterionRating WHERE ObservationID IN ({current_obs})"),
        {"cycle_id": cycle_id},
    )
    surveys_app = conn.execute(
        text(f"DELETE FROM AppSurveyResponse WHERE ObservationID IN ({current_obs})"),
        {"cycle_id": cycle_id},
    )
    observations = conn.execute(
        text(
            f"""
            DELETE FROM Observation
            WHERE ObservationID IN ({current_obs})
               OR SignupID IN (SELECT SignupID FROM ObservationSignup WHERE CycleID = :cycle_id)
            """
        ),
        {"cycle_id": cycle_id},
    )
    surveys = conn.execute(
        text(
            """
            DELETE FROM PostObservationSurveyResponse
            WHERE CycleID = :cycle_id
               OR SignupID IN (SELECT SignupID FROM ObservationSignup WHERE CycleID = :cycle_id)
            """
        ),
        {"cycle_id": cycle_id},
    )
    requests = conn.execute(
        text(
            """
            DELETE FROM ObserverRequest
            WHERE SignupID IN (SELECT SignupID FROM ObservationSignup WHERE CycleID = :cycle_id)
            """
        ),
        {"cycle_id": cycle_id},
    )
    # replica skips ON DELETE CASCADE, so child rows must be removed by hand.
    conn.execute(
        text(
            """
            DELETE FROM SignupPreferredDate
            WHERE SignupID IN (SELECT SignupID FROM ObservationSignup WHERE CycleID = :cycle_id)
               OR NOT EXISTS (
                   SELECT 1 FROM ObservationSignup os
                   WHERE os.SignupID = SignupPreferredDate.SignupID
               )
            """
        ),
        {"cycle_id": cycle_id},
    )
    conn.execute(
        text(
            """
            DELETE FROM SignupObserverList
            WHERE SignupID IN (SELECT SignupID FROM ObservationSignup WHERE CycleID = :cycle_id)
               OR NOT EXISTS (
                   SELECT 1 FROM ObservationSignup os
                   WHERE os.SignupID = SignupObserverList.SignupID
               )
            """
        ),
        {"cycle_id": cycle_id},
    )
    signups = conn.execute(
        text("DELETE FROM ObservationSignup WHERE CycleID = :cycle_id"),
        {"cycle_id": cycle_id},
    )
    conn.execute(text("SET LOCAL session_replication_role = 'origin'"))
    return {
        "signups": signups.rowcount or 0,
        "observations": observations.rowcount or 0,
        "requests": requests.rowcount or 0,
        "surveys": (surveys.rowcount or 0) + (surveys_app.rowcount or 0),
        "ratings": ratings.rowcount or 0,
    }


def _insert_past_observation(conn, professor, past_cycle, completed_on, current_cycle_id):
    # Only a completed observation on a prior cycle. Never the current cycle.
    if past_cycle["cycleid"] == current_cycle_id:
        return False
    if conn.execute(text(HAS_COMPLETED_SQL), {"professor_id": professor["professorid"]}).first():
        return False
    section_id = conn.execute(
        text(PAST_SECTION_SQL),
        {"term_id": past_cycle["termid"], "department_id": professor["professordepartment"]},
    ).scalar()
    if section_id is None:
        section_id = conn.execute(text(ANY_PAST_SECTION_SQL), {"term_id": past_cycle["termid"]}).scalar()
    if section_id is None:
        return False
    conn.execute(
        text(
            """
            INSERT INTO TeachingAssignment (SectionID, ProfessorID)
            VALUES (:section_id, :professor_id)
            ON CONFLICT DO NOTHING
            """
        ),
        {"section_id": section_id, "professor_id": professor["professorid"]},
    )
    existing = conn.execute(
        text(
            """
            SELECT signupid FROM ObservationSignup
            WHERE CycleID = :cycle_id AND ObserveeProfessorID = :professor_id
            LIMIT 1
            """
        ),
        {"cycle_id": past_cycle["cycleid"], "professor_id": professor["professorid"]},
    ).scalar()
    if existing is None:
        signup_id = conn.execute(
            text(
                """
                SELECT GREATEST(
                    COALESCE((SELECT MAX(SignupID) FROM ObservationSignup), 0),
                    COALESCE((SELECT MAX(SignupID) FROM SignupPreferredDate), 0),
                    COALESCE((SELECT MAX(SignupID) FROM SignupObserverList), 0)
                ) + 1
                """
            )
        ).scalar_one()
        signup_date = min(past_cycle["signupdeadline"], completed_on)
        conn.execute(
            text(
                """
                INSERT INTO ObservationSignup (
                    SignupID, CycleID, ObserveeProfessorID, SectionID, SignupDate, SignupTime, Status
                )
                VALUES (
                    :signup_id, :cycle_id, :professor_id, :section_id, :signup_date, '09:00', 'Accepted'
                )
                """
            ),
            {
                "signup_id": signup_id,
                "cycle_id": past_cycle["cycleid"],
                "professor_id": professor["professorid"],
                "section_id": section_id,
                "signup_date": signup_date,
            },
        )
    else:
        signup_id = existing
    observer_id = conn.execute(
        text(OTHER_PROFESSOR_SQL),
        {"professor_id": professor["professorid"], "department_id": professor["professordepartment"]},
    ).scalar()
    if observer_id is None:
        return False
    names = conn.execute(
        text("SELECT professorid, professorname FROM Professors WHERE professorid = :a OR professorid = :b"),
        {"a": professor["professorid"], "b": observer_id},
    ).mappings().all()
    by_id = {row["professorid"]: row["professorname"] for row in names}
    observation_id = conn.execute(text("SELECT COALESCE(MAX(ObservationID), 0) + 1 FROM Observation")).scalar_one()
    # Past completed rows are fixtures for the due view, not this cycle's process.
    # Skip request/eligibility triggers; FKs still apply.
    conn.execute(text("SET LOCAL session_replication_role = 'replica'"))
    conn.execute(
        text(
            """
            INSERT INTO Observation (
                ObservationID, SignupID, ObservationDate, ObserverProfessorID, TemplateID,
                ScheduledDate, ScheduledTime, CompletedDate, CompletedTime, Status,
                Signee, Observer, ObserverSigned, ObserveeSigned, ObserveeID, ObservationTime
            )
            VALUES (
                :observation_id, :signup_id, :completed_on, :observer_id, :template_id,
                :completed_on, '10:00', :completed_on, '11:00', 'Completed',
                :observee_name, :observer_name, TRUE, TRUE, :observee_id, '10:00'
            )
            """
        ),
        {
            "observation_id": observation_id,
            "signup_id": signup_id,
            "completed_on": completed_on,
            "observer_id": observer_id,
            "template_id": past_cycle["templateid"],
            "observee_name": by_id.get(professor["professorid"], ""),
            "observer_name": by_id.get(observer_id, ""),
            "observee_id": professor["professorid"],
        },
    )
    conn.execute(text("SET LOCAL session_replication_role = 'origin'"))
    return True


# What: fill Unknown professors so the due view can compute, and seed the observer pool.
@router.post("/randomize-unknowns")
def randomize_unknowns():
    # Input: none
    # Output: counts of rank/start-term/observation writes, plus current-cycle rows removed
    # Test fixture only. Rank frequencies follow the process; last-eval dates are
    # invented completed Observation rows on a prior cycle so the SQL view is not Unknown.
    # This cycle's signups and in-progress observations are cleared, not invented.
    rng = random.Random()
    with engine.begin() as conn:
        current = resolve_cycle(conn)
        cleared = _clear_current_cycle_process(conn, current["cycleid"])
        unknowns = conn.execute(text(UNKNOWN_PROFESSORS_SQL)).mappings().all()
        past = conn.execute(
            text(PAST_CYCLE_SQL),
            {"semester": current["semester"], "year": current["yearnum"]},
        ).mappings().first()
        filled, observations = 0, 0
        for professor in unknowns:
            level, last_eval = rng.choice(LAST_EVAL_CHOICES)
            start_term_id = _start_term_before(
                conn, last_eval, current["semester"], current["yearnum"]
            )
            conn.execute(
                text(PROFESSOR_UPDATE_SQL),
                {
                    "professor_id": professor["professorid"],
                    "current_level": level,
                    "start_term_id": start_term_id,
                },
            )
            filled += 1
            if past is not None and _insert_past_observation(
                conn, professor, past, last_eval, current["cycleid"]
            ):
                observations += 1
        repaired = 0
        for professor in conn.execute(text(ALL_PROFESSORS_SQL)).mappings().all():
            last_eval = _as_date(_last_eval_date(conn, professor["professorid"]))
            start_term_id = _coerced_start_term_id(
                conn,
                professor["starttermid"],
                last_eval,
                current["semester"],
                current["yearnum"],
            )
            if start_term_id == professor["starttermid"]:
                continue
            conn.execute(
                text(PROFESSOR_UPDATE_SQL),
                {
                    "professor_id": professor["professorid"],
                    "current_level": professor["currentlevel"],
                    "start_term_id": start_term_id,
                },
            )
            repaired += 1
        pool = _sync_observer_pool_to_signups(conn, current["cycleid"])
    return {
        "unknown_before": len(unknowns),
        "filled": filled,
        "past_observations": observations,
        "start_terms_repaired": repaired,
        "availability_seeded": pool,
        "current_signups_cleared": cleared["signups"],
        "current_observations_cleared": cleared["observations"],
        "current_requests_cleared": cleared["requests"],
    }


# What: freeze the clock to 7 days before the signup deadline.
@router.post("/begin-cycle")
def begin_cycle():
    # Input: none
    # Output: clock at the start of signup, current cycle
    with engine.begin() as conn:
        cycle = resolve_cycle(conn)
        _sync_observer_pool_to_signups(conn, cycle["cycleid"])
    start = datetime.combine(cycle["signupdeadline"] - timedelta(days=7), time(10, 0))
    set_campus_clock(start)
    return {
        **_clock_payload(),
        "current_cycle": cycle_payload(cycle, start.date()),
        "message": "Clock is 7 days before the signup deadline. Sign up for one course, then close signup to match.",
    }


# What: move the frozen campus clock forward by N days.
@router.post("/advance-days")
def advance_days(body: AdvanceBody):
    # Input: days (can be negative)
    # Output: clock after the move
    if body.days == 0:
        raise HTTPException(status_code=400, detail="days must not be 0")
    now = campus_now()
    set_campus_clock(now + timedelta(days=body.days))
    return _clock_payload()


# What: replace preferred dates on a signup (before requests are sent).
@router.put("/signups/{signup_id}/preferred-dates")
def put_preferred_dates(signup_id: int, body: PreferredDatesBody):
    # Input: signup_id, dates that are class meeting days before the observation deadline
    # Output: the saved dates
    dates = sorted(set(body.dates))
    if not dates:
        raise HTTPException(status_code=400, detail="Add at least one date")
    today = campus_now().date()
    with engine.begin() as conn:
        signup = conn.execute(
            text(
                """
                SELECT os.signupid, os.cycleid, os.status, s.meetingdays, s.starttime, s.endtime, s.termid
                FROM ObservationSignup os
                JOIN Sections s ON os.SectionID = s.SectionID
                WHERE os.SignupID = :signup_id
                """
            ),
            {"signup_id": signup_id},
        ).mappings().first()
        if signup is None:
            raise HTTPException(status_code=404, detail="Signup not found")
        if signup["status"] not in ("Pending", "Matched", "Unmatched", "List Ready"):
            raise HTTPException(
                status_code=400,
                detail=f"Preferred dates are locked after requests are sent (signup is {signup['status']})",
            )
        cycle = resolve_cycle(conn, signup["cycleid"])
        _check_preferred_dates(dates, signup, cycle, today)
        conn.execute(text("DELETE FROM SignupPreferredDate WHERE SignupID = :signup_id"), {"signup_id": signup_id})
        for preferred in dates:
            conn.execute(
                text("INSERT INTO SignupPreferredDate (SignupID, PreferredDate) VALUES (:signup_id, :d)"),
                {"signup_id": signup_id, "d": preferred},
            )
    return {"signup_id": signup_id, "preferred_dates": [d.isoformat() for d in dates]}


def _class_summary(row):
    return {
        "professor_id": row["professorid"],
        "name": row["professorname"],
        "department": row["departmentname"],
        "status": "Due",
        "section_id": row["sectionid"],
        "section_name": row["sectionname"],
        "course_code": row["coursecode"],
        "course_name": row["coursename"],
        "course_level": course_level(row["coursecode"]),
        "meeting_days": row["meetingdays"],
        "start_time": _time_str(row["starttime"]),
        "end_time": _time_str(row["endtime"]),
    }


def _busy_during(observer_sections, target):
    start = parse_clock(target["starttime"])
    end = parse_clock(target["endtime"])
    if start is None or end is None or not parse_days(target["meetingdays"]):
        return True
    if end > TEST_AVAILABILITY_END:
        return True
    return any(
        is_busy(
            row["meetingdays"],
            parse_clock(row["starttime"]),
            parse_clock(row["endtime"]),
            target["meetingdays"],
            start,
            end,
            False,
        )
        for row in observer_sections
    )


def _taught_level(sections, level):
    return any(course_level(row["coursecode"]) == level for row in sections)


def _find_due_observer_pair(conn, cycle):
    # Two Due faculty, not signed up, same department, same course level, each
    # free during the other's class. Assumes they will get 08:00–19:00
    # availability when they sign up (tester pool rule).
    rows = conn.execute(
        text(DUE_UNSIGNED_CLASSES_SQL),
        {
            "semester": cycle["semester"],
            "year": cycle["yearnum"],
            "cycle_id": cycle["cycleid"],
        },
    ).mappings().all()
    people = {}
    for row in rows:
        person = people.setdefault(
            row["professorid"],
            {
                "professorid": row["professorid"],
                "professorname": row["professorname"],
                "professordepartment": row["professordepartment"],
                "departmentname": row["departmentname"],
                "sections": [],
            },
        )
        person["sections"].append(row)
    ids = sorted(
        people,
        key=lambda professor_id: (
            0 if professor_id > 7 else 1,
            people[professor_id]["professorname"].lower(),
        ),
    )
    best = None
    for i, left_id in enumerate(ids):
        left = people[left_id]
        for right_id in ids[i + 1 :]:
            right = people[right_id]
            if left["professordepartment"] != right["professordepartment"]:
                continue
            for observee in left["sections"]:
                level = course_level(observee["coursecode"])
                if level is None or not _taught_level(right["sections"], level):
                    continue
                if _busy_during(right["sections"], observee):
                    continue
                for observer_class in right["sections"]:
                    if course_level(observer_class["coursecode"]) != level:
                        continue
                    if _busy_during(left["sections"], observer_class):
                        continue
                    disjoint = not (
                        parse_days(observee["meetingdays"])
                        & parse_days(observer_class["meetingdays"])
                    )
                    candidate = (0 if disjoint else 1, _class_summary(observee), _class_summary(observer_class))
                    if best is None or candidate[0] < best[0]:
                        best = candidate
                    if best[0] == 0:
                        return {"a": best[1], "b": best[2]}
    if best is None:
        return None
    return {"a": best[1], "b": best[2]}


# What: two Due professors who have not signed up and can observe each other.
@router.get("/demo-pair")
def get_demo_pair():
    # Input: none
    # Output: two Due, unsigned faculty in the same department and course level,
    #         each free at the other's class time, or pair null
    with engine.connect() as conn:
        cycle = resolve_cycle(conn)
        pair = _find_due_observer_pair(conn, cycle)
    return {
        "cycle_id": cycle["cycleid"],
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "pair": pair,
    }


# What: pipeline snapshot for one observee: classes, signup, list, requests, next step.
@router.get("/pipeline")
def get_pipeline(observee_id: int | None = Query(default=None)):
    # Input: optional observee_id
    # Output: candidates, classes, signup, observer list, requests, suggested next step
    clock = _clock_payload()
    today = campus_now().date()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn)
        payload = cycle_payload(cycle, today)
        candidates = conn.execute(
            text(CANDIDATES_SQL),
            {"semester": cycle["semester"], "year": cycle["yearnum"], "cycle_id": cycle["cycleid"]},
        ).mappings().all()
        observee = None
        if observee_id is not None:
            observee = conn.execute(text(PROFESSOR_GET_SQL), {"professor_id": observee_id}).mappings().first()
            if observee is None:
                raise HTTPException(status_code=404, detail=f"Faculty {observee_id} not found")
        classes = []
        signup = None
        observers = []
        requests = []
        if observee is not None:
            classes = [
                {
                    "section_id": row["sectionid"],
                    "course_code": row["coursecode"],
                    "course_name": row["coursename"],
                    "section_name": row["sectionname"],
                    "meeting_days": row["meetingdays"],
                    "start_time": _time_str(row["starttime"]),
                    "end_time": _time_str(row["endtime"]),
                    "suggested_dates": [
                        d.isoformat()
                        for d in next_class_dates(
                            row["meetingdays"], today, cycle["observationdeadline"], 2
                        )
                    ],
                }
                for row in conn.execute(
                    text(CLASSES_SQL),
                    {
                        "professor_id": observee_id,
                        "semester": cycle["semester"],
                        "year": cycle["yearnum"],
                    },
                ).mappings()
            ]
            signup_row = conn.execute(
                text(
                    """
                    SELECT os.signupid, os.status, os.sectionid, c.coursecode, s.sectionname, s.meetingdays,
                           ARRAY(
                               SELECT spd.PreferredDate FROM SignupPreferredDate spd
                               WHERE spd.SignupID = os.SignupID ORDER BY spd.PreferredDate
                           ) AS preferreddates
                    FROM ObservationSignup os
                    JOIN Sections s ON os.SectionID = s.SectionID
                    JOIN Courses c ON s.CourseID = c.CourseID
                    WHERE os.CycleID = :cycle_id AND os.ObserveeProfessorID = :professor_id
                    ORDER BY os.signupid
                    LIMIT 1
                    """
                ),
                {"cycle_id": cycle["cycleid"], "professor_id": observee_id},
            ).mappings().first()
            if signup_row is not None:
                signup = {
                    "signup_id": signup_row["signupid"],
                    "status": signup_row["status"],
                    "section_id": signup_row["sectionid"],
                    "course_code": signup_row["coursecode"],
                    "section_name": signup_row["sectionname"],
                    "meeting_days": signup_row["meetingdays"],
                    "preferred_dates": [d.isoformat() for d in (signup_row["preferreddates"] or [])],
                }
                observers = [
                    {"observer_id": row["professorid"], "name": row["professorname"]}
                    for row in conn.execute(
                        text(
                            """
                            SELECT p.professorid, p.professorname
                            FROM SignupObserverList sol
                            JOIN Professors p ON sol.ObserverProfessorID = p.ProfessorID
                            WHERE sol.SignupID = :signup_id
                            ORDER BY p.professorname
                            """
                        ),
                        {"signup_id": signup_row["signupid"]},
                    ).mappings()
                ]
                requests = [
                    {
                        "request_id": row["requestid"],
                        "observer_id": row["observerprofessorid"],
                        "observer_name": row["professorname"],
                        "status": row["status"],
                    }
                    for row in conn.execute(
                        text(
                            """
                            SELECT r.requestid, r.observerprofessorid, r.status, p.professorname
                            FROM ObserverRequest r
                            JOIN Professors p ON r.ObserverProfessorID = p.ProfessorID
                            WHERE r.SignupID = :signup_id
                            ORDER BY r.requestid
                            """
                        ),
                        {"signup_id": signup_row["signupid"]},
                    ).mappings()
                ]
    step = "begin"
    if payload["phase"] != "signup" and signup is None:
        step = "begin"
    elif signup is None:
        step = "signup"
    elif payload["phase"] == "signup":
        step = "close_signup"
    elif signup["status"] in ("Pending", "Unmatched"):
        step = "match"
    elif signup["status"] == "Matched":
        step = "notify"
    elif signup["status"] == "List Ready":
        step = "invite"
    elif requests and any(item["status"] == "Pending" for item in requests):
        step = "accept"
    else:
        step = "done"
    return {
        **clock,
        "current_cycle": payload,
        "step": step,
        "candidates": [
            {"professor_id": row["professorid"], "name": row["professorname"]} for row in candidates
        ],
        "observee": _professor_payload(observee) if observee is not None else None,
        "classes": classes,
        "signup": signup,
        "observers": observers,
        "requests": requests,
    }
