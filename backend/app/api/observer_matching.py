import random
from datetime import datetime, time

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.api.cycle_deadlines import resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["observer-matching"])

# SRS / Q15: return at most 5 names; pick at random when more qualify.
MAX_MATCHES = 5

DAY_NAMES = {
    "MONDAY": "M",
    "MON": "M",
    "TUESDAY": "T",
    "TUE": "T",
    "TUES": "T",
    "WEDNESDAY": "W",
    "WED": "W",
    "THURSDAY": "R",
    "THU": "R",
    "THUR": "R",
    "THURS": "R",
    "TH": "R",
    "FRIDAY": "F",
    "FRI": "F",
}

OBSERVEE_SQL = """
SELECT
    p.professorid,
    p.professorname,
    p.professordepartment AS departmentid,
    d.departmentname
FROM Professors p
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
WHERE p.ProfessorID = :professor_id
"""

SIGNUP_SECTION_SQL = """
SELECT
    os.signupid,
    s.sectionid,
    s.sectionname,
    s.termid,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.courseid,
    c.coursecode,
    c.coursename
FROM ObservationSignup os
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE os.ObserveeProfessorID = :professor_id
  AND os.CycleID = :cycle_id
"""

SECTION_SQL = """
SELECT
    s.sectionid,
    s.sectionname,
    s.termid,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.courseid,
    c.coursecode,
    c.coursename
FROM Sections s
JOIN Courses c ON s.CourseID = c.CourseID
WHERE s.SectionID = :section_id
"""

COURSE_SECTION_SQL = """
SELECT
    s.sectionid,
    s.sectionname,
    s.termid,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.courseid,
    c.coursecode,
    c.coursename
FROM TeachingAssignment ta
JOIN Sections s ON ta.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE ta.ProfessorID = :professor_id
  AND c.CourseID = :course_id
  AND s.TermID = :term_id
ORDER BY s.sectionid
"""

TEACHES_SQL = """
SELECT 1
FROM TeachingAssignment
WHERE ProfessorID = :professor_id
  AND SectionID = :section_id
"""

SIGNUP_DETAIL_SQL = """
SELECT
    os.signupid,
    os.observeeprofessorid,
    os.cycleid,
    s.sectionid,
    s.sectionname,
    s.termid,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.courseid,
    c.coursecode,
    c.coursename
FROM ObservationSignup os
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE os.SignupID = :signup_id
"""

CYCLE_SIGNUPS_SQL = """
SELECT
    os.signupid,
    os.observeeprofessorid,
    os.cycleid,
    s.sectionid,
    s.sectionname,
    s.termid,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.courseid,
    c.coursecode,
    c.coursename
FROM ObservationSignup os
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE os.CycleID = :cycle_id
ORDER BY os.signupid
"""

# Victor's database rule (get_eligible_observers) is the one source of truth for a signup,
# so the preview, the saved lists, and the request trigger always agree.
SIGNUP_ELIGIBLE_SQL = """
SELECT e.professorid, e.professorname, d.departmentname
FROM get_eligible_observers(:signup_id) e
JOIN Professors p ON p.ProfessorID = e.ProfessorID
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
ORDER BY e.professorname
"""

RANKED_TERMS_SQL = """
WITH ranked_terms AS (
    SELECT
        t.TermID,
        ROW_NUMBER() OVER (
            ORDER BY t.YearNum DESC,
                     CASE t.Semester WHEN 'Fall' THEN 2 WHEN 'Spring' THEN 1 END DESC
        ) AS term_rank
    FROM AcademicTerm t
    WHERE t.Semester IN ('Fall', 'Spring')
)
"""

LEVEL_EXISTS_SQL = """
  AND EXISTS (
      SELECT 1
      FROM TeachingAssignment ta
      JOIN Sections s ON s.SectionID = ta.SectionID
      JOIN Courses c ON c.CourseID = s.CourseID
      JOIN ranked_terms history_term ON history_term.TermID = s.TermID
      JOIN ranked_terms current_term ON current_term.TermID = :term_id
      WHERE ta.ProfessorID = p.ProfessorID
        AND history_term.term_rank BETWEEN current_term.term_rank AND current_term.term_rank + 3
        AND LEFT(SPLIT_PART(c.CourseCode, ' ', 2), 1) = :level_digit
  )
"""

# Same rules for a day/time that isn't tied to a signup: same department, not the observee,
# active observer this cycle, and taught the course level in the last four Fall/Spring terms.
ADHOC_CANDIDATES_SQL = RANKED_TERMS_SQL + """
SELECT p.professorid, p.professorname, d.departmentname
FROM Professors p
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
WHERE p.ProfessorID <> :faculty_id
  AND p.ProfessorDepartment = :department_id
  AND EXISTS (
      SELECT 1
      FROM ObserverEnrollment oe
      WHERE oe.ProfessorID = p.ProfessorID
        AND oe.CycleID = :cycle_id
        AND oe.Status = 'Active'
  )
""" + LEVEL_EXISTS_SQL + """
ORDER BY p.professorname
"""

# Tester AC preview: treat every Due professor as if they signed up (pool = Due, hours 08:00–19:00).
DUE_POOL_CANDIDATES_SQL = RANKED_TERMS_SQL + """
SELECT p.professorid, p.professorname, d.departmentname
FROM Professors p
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
JOIN ProfessorEvaluationStatus pes ON pes.ProfessorID = p.ProfessorID
WHERE p.ProfessorID <> :faculty_id
  AND p.ProfessorDepartment = :department_id
  AND pes.EvaluationStatus = 'Due'
""" + LEVEL_EXISTS_SQL + """
ORDER BY p.professorname
"""

# Hours the tester assigns when someone signs up (covers late CourseBook sections).
ASSUMED_SIGNUP_START = time(8, 0)
ASSUMED_SIGNUP_END = time(19, 0)
ASSUMED_SIGNUP_DAYS = "MTWRF"

AVAILABILITY_SQL = """
SELECT professorid, weekday, starttime, endtime
FROM ObserverAvailability
WHERE CycleID = :cycle_id
  AND ProfessorID = ANY(:professor_ids)
"""

TERM_SECTIONS_SQL = """
SELECT ta.professorid, s.meetingdays, s.starttime, s.endtime
FROM TeachingAssignment ta
JOIN Sections s ON ta.SectionID = s.SectionID
WHERE s.TermID = :term_id
  AND ta.ProfessorID = ANY(:professor_ids)
"""


class MatchRequest(BaseModel):
    faculty_id: int
    course_id: int | None = None
    section_id: int | None = None
    requested_day: str | None = None
    requested_time: str | None = None
    cycle_id: int | None = None


def course_level(course_code):
    if not course_code:
        return None
    for character in course_code:
        if character.isdigit():
            return int(character) * 1000
    return None


def parse_days(value):
    if not value:
        return set()
    raw = value.strip().upper()
    if raw in DAY_NAMES:
        return {DAY_NAMES[raw]}
    days = set()
    index = 0
    while index < len(raw):
        if raw[index] == "T" and index + 1 < len(raw) and raw[index + 1] == "H":
            days.add("R")
            index += 2
            continue
        if raw[index] in "MTWRF":
            days.add(raw[index])
        index += 1
    return days


def parse_clock(value):
    if value is None:
        return None
    if isinstance(value, time):
        return value.replace(microsecond=0)
    text_value = str(value).strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text_value, fmt).time()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"Invalid time: {value}")


def parse_requested_window(requested_time, default_start, default_end):
    if not requested_time:
        return default_start, default_end, False
    text_value = requested_time.strip()
    if "-" in text_value:
        start_text, end_text = text_value.split("-", 1)
        return parse_clock(start_text), parse_clock(end_text), False
    point = parse_clock(text_value)
    return point, point, True


def days_overlap(left, right):
    return bool(parse_days(left) & parse_days(right))


def times_overlap(start_a, end_a, start_b, end_b):
    if None in (start_a, end_a, start_b, end_b):
        return False
    return start_a < end_b and start_b < end_a


def point_during_class(point, start, end):
    if None in (point, start, end):
        return False
    return start <= point < end


def is_busy(meeting_days, start_time, end_time, requested_days, window_start, window_end, point_only):
    if not days_overlap(meeting_days, requested_days):
        return False
    if point_only:
        return point_during_class(window_start, start_time, end_time)
    return times_overlap(start_time, end_time, window_start, window_end)


def _time_str(value):
    if value is None:
        return None
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _require_observee(conn, professor_id):
    row = conn.execute(text(OBSERVEE_SQL), {"professor_id": professor_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Professor not found")
    return row


def _load_target_section(conn, request, cycle):
    if request.section_id is not None:
        section = conn.execute(
            text(SECTION_SQL), {"section_id": request.section_id}
        ).mappings().first()
        if section is None:
            raise HTTPException(status_code=404, detail="Section not found")
        teaches = conn.execute(
            text(TEACHES_SQL),
            {"professor_id": request.faculty_id, "section_id": request.section_id},
        ).first()
        if teaches is None:
            raise HTTPException(
                status_code=400,
                detail="Professor can only request observers for a section they teach",
            )
        return section

    if request.course_id is not None:
        section = conn.execute(
            text(COURSE_SECTION_SQL),
            {
                "professor_id": request.faculty_id,
                "course_id": request.course_id,
                "term_id": cycle["termid"],
            },
        ).mappings().first()
        if section is None:
            raise HTTPException(
                status_code=400,
                detail="Professor does not teach that course this term",
            )
        return section

    section = conn.execute(
        text(SIGNUP_SECTION_SQL),
        {"professor_id": request.faculty_id, "cycle_id": cycle["cycleid"]},
    ).mappings().first()
    if section is None:
        raise HTTPException(status_code=404, detail="No signup for this cycle")
    return section


def _observer(row):
    return {
        "observer_id": row["professorid"],
        "name": row["professorname"],
        "department": row["departmentname"],
    }


def _signup_eligible(conn, signup_id):
    rows = conn.execute(text(SIGNUP_ELIGIBLE_SQL), {"signup_id": signup_id}).mappings().all()
    return [_observer(row) for row in rows]


def _covers(slot_start, slot_end, window_start, window_end, point_only):
    if None in (slot_start, slot_end, window_start, window_end):
        return False
    if point_only:
        return slot_start <= window_start < slot_end
    return slot_start <= window_start and slot_end >= window_end


def _adhoc_eligible(
    conn, faculty_id, department_id, cycle, level, requested_days, window_start, window_end, point_only,
    due_pool=False,
):
    params = {
        "faculty_id": faculty_id,
        "department_id": department_id,
        "term_id": cycle["termid"],
        "level_digit": str(level // 1000),
    }
    if due_pool:
        candidates = conn.execute(text(DUE_POOL_CANDIDATES_SQL), params).mappings().all()
    else:
        params["cycle_id"] = cycle["cycleid"]
        candidates = conn.execute(text(ADHOC_CANDIDATES_SQL), params).mappings().all()
    if not candidates:
        return []
    ids = [row["professorid"] for row in candidates]
    availability, sections = {}, {}
    if due_pool:
        assumed = {day: (ASSUMED_SIGNUP_START, ASSUMED_SIGNUP_END) for day in ASSUMED_SIGNUP_DAYS}
        availability = {professor_id: assumed for professor_id in ids}
    else:
        for row in conn.execute(
            text(AVAILABILITY_SQL), {"cycle_id": cycle["cycleid"], "professor_ids": ids}
        ).mappings():
            availability.setdefault(row["professorid"], {})[row["weekday"]] = (
                parse_clock(row["starttime"]),
                parse_clock(row["endtime"]),
            )
    for row in conn.execute(
        text(TERM_SECTIONS_SQL), {"term_id": cycle["termid"], "professor_ids": ids}
    ).mappings():
        sections.setdefault(row["professorid"], []).append(row)

    eligible = []
    for candidate in candidates:
        slots = availability.get(candidate["professorid"], {})
        for day in sorted(parse_days(requested_days)):
            if day not in slots or not _covers(*slots[day], window_start, window_end, point_only):
                continue
            busy = any(
                is_busy(
                    row["meetingdays"],
                    parse_clock(row["starttime"]),
                    parse_clock(row["endtime"]),
                    day,
                    window_start,
                    window_end,
                    point_only,
                )
                for row in sections.get(candidate["professorid"], [])
            )
            if not busy:
                eligible.append(_observer(candidate))
                break
    return eligible


def _pick_observers(eligible):
    if len(eligible) <= MAX_MATCHES:
        return eligible
    return sorted(random.sample(eligible, MAX_MATCHES), key=lambda item: item["name"])


def build_match_result(
    conn, faculty_id, section, cycle, requested_day=None, requested_time=None, signup_id=None, due_pool=False,
):
    observee = _require_observee(conn, faculty_id)
    if section["termid"] != cycle["termid"]:
        raise HTTPException(
            status_code=400,
            detail="Section is not in the current evaluation-cycle term",
        )

    requested_days = requested_day or section["meetingdays"]
    window_start, window_end, point_only = parse_requested_window(
        requested_time,
        parse_clock(section["starttime"]),
        parse_clock(section["endtime"]),
    )
    level = course_level(section["coursecode"])
    if level is None:
        raise HTTPException(status_code=400, detail="Course code has no course level")

    if signup_id is None and requested_day is None and requested_time is None:
        signup_id = section.get("signupid")
    if due_pool:
        eligible = _adhoc_eligible(
            conn, faculty_id, observee["departmentid"], cycle, level,
            requested_days, window_start, window_end, point_only,
            due_pool=True,
        )
    elif signup_id is not None and requested_day is None and requested_time is None:
        eligible = _signup_eligible(conn, signup_id)
    else:
        eligible = _adhoc_eligible(
            conn, faculty_id, observee["departmentid"], cycle, level,
            requested_days, window_start, window_end, point_only,
        )
    payload = {
        "faculty_id": observee["professorid"],
        "faculty_name": observee["professorname"],
        "department_id": observee["departmentid"],
        "department_name": observee["departmentname"],
        "course_id": section["courseid"],
        "course_code": section["coursecode"],
        "course_name": section["coursename"],
        "course_level": level,
        "section_id": section["sectionid"],
        "meeting_days": requested_days,
        "start_time": _time_str(window_start),
        "end_time": _time_str(window_end),
        "eligible_count": len(eligible),
        "insufficient": len(eligible) == 0,
        "observers": _pick_observers(eligible),
    }
    if signup_id is not None:
        payload["signup_id"] = signup_id
    return payload


def generate_for_signup(conn, signup, cycle=None):
    if cycle is None:
        cycle = resolve_cycle(conn, signup["cycleid"])
    return build_match_result(
        conn,
        signup["observeeprofessorid"],
        signup,
        cycle,
        signup_id=signup["signupid"],
    )


def observers_for_signup_id(signup_id):
    with engine.connect() as conn:
        signup = conn.execute(
            text(SIGNUP_DETAIL_SQL), {"signup_id": signup_id}
        ).mappings().first()
        if signup is None:
            raise HTTPException(status_code=404, detail="Signup not found")
        return generate_for_signup(conn, signup)


def generate_for_cycle(conn, cycle_id=None):
    cycle = resolve_cycle(conn, cycle_id)
    signups = conn.execute(
        text(CYCLE_SIGNUPS_SQL), {"cycle_id": cycle["cycleid"]}
    ).mappings().all()
    results = [generate_for_signup(conn, signup, cycle) for signup in signups]
    return {
        "cycle_id": cycle["cycleid"],
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "signup_count": len(results),
        "insufficient_count": sum(1 for item in results if item["insufficient"]),
        "signups": results,
    }


DUE_PROFESSORS_SQL = """
SELECT professorid, professorname, evaluationstatus
FROM ProfessorEvaluationStatus
WHERE evaluationstatus = 'Due'
ORDER BY professorname
"""

FIRST_CLASS_SQL = """
SELECT DISTINCT ON (ta.professorid)
    ta.professorid,
    s.sectionid,
    s.sectionname,
    s.termid,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.courseid,
    c.coursecode,
    c.coursename
FROM TeachingAssignment ta
JOIN Sections s ON s.SectionID = ta.SectionID
JOIN Courses c ON c.CourseID = s.CourseID
JOIN AcademicTerm t ON t.TermID = s.TermID
WHERE t.Semester = :semester
  AND t.YearNum = :year
  AND ta.ProfessorID = ANY(:professor_ids)
ORDER BY ta.professorid, c.coursecode, s.sectionname
"""


def _empty_due_match(person, reason):
    return {
        "faculty_id": person["professorid"],
        "faculty_name": person["professorname"],
        "evaluation_status": person["evaluationstatus"],
        "signed_up": False,
        "course_code": None,
        "course_name": None,
        "section_id": None,
        "meeting_days": None,
        "start_time": None,
        "end_time": None,
        "eligible_count": 0,
        "insufficient": True,
        "observers": [],
        "reason": reason,
    }


def generate_due_matches(conn, cycle_id=None):
    # Tester AC: if every Due professor signed up, who could observe whom.
    # Does not write signups or enrollments. Pool is Due faculty; hours 08:00–19:00.
    cycle = resolve_cycle(conn, cycle_id)
    due = conn.execute(text(DUE_PROFESSORS_SQL)).mappings().all()
    signups = {
        row["observeeprofessorid"]: row
        for row in conn.execute(text(CYCLE_SIGNUPS_SQL), {"cycle_id": cycle["cycleid"]}).mappings()
    }
    ids = [row["professorid"] for row in due]
    classes = {}
    if ids:
        for row in conn.execute(
            text(FIRST_CLASS_SQL),
            {"semester": cycle["semester"], "year": cycle["yearnum"], "professor_ids": ids},
        ).mappings():
            classes[row["professorid"]] = row
    faculty = []
    for person in due:
        signup = signups.get(person["professorid"])
        section = signup if signup is not None else classes.get(person["professorid"])
        if section is None:
            faculty.append(_empty_due_match(person, "No class this term"))
            continue
        match = build_match_result(conn, person["professorid"], section, cycle, due_pool=True)
        faculty.append({
            **match,
            "evaluation_status": person["evaluationstatus"],
            "signed_up": signup is not None,
        })
    return {
        "cycle_id": cycle["cycleid"],
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "assumed_due_signups": True,
        "faculty_count": len(faculty),
        "insufficient_count": sum(1 for item in faculty if item["insufficient"]),
        "faculty": faculty,
    }


# What: eligible observers for an observee's class (AHC-243).
@router.post("/match-observers")
def match_observers(request: MatchRequest):
    # Input: faculty_id, optional course_id/section_id, optional requested_day/time, optional cycle_id
    # Output: up to 5 observers in the same department, same course level, free at that class time
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, request.cycle_id)
        section = _load_target_section(conn, request, cycle)
        return build_match_result(
            conn,
            request.faculty_id,
            section,
            cycle,
            requested_day=request.requested_day,
            requested_time=request.requested_time,
        )


# What: up to 5 eligible observers for one signup (AHC-245).
@router.get("/signups/{signup_id}/eligible-observers")
def get_signup_eligible_observers(signup_id: int):
    # Input: signup_id
    # Output: that signup's match list (empty if nobody qualifies)
    with engine.connect() as conn:
        signup = conn.execute(
            text(SIGNUP_DETAIL_SQL), {"signup_id": signup_id}
        ).mappings().first()
        if signup is None:
            raise HTTPException(status_code=404, detail="Signup not found")
        return generate_for_signup(conn, signup)


# What: generate up to 5 eligible observers for every signup in the cycle (AHC-245).
@router.post("/match-observers/signups")
def generate_observers_for_signups(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: optional cycle_id
    # Output: each signup with up to 5 eligible observers
    with engine.connect() as conn:
        return generate_for_cycle(conn, cycle_id)


# What: tester preview of potential observers if every Due professor signed up.
@router.get("/due-matches")
def get_due_matches(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: optional cycle_id
    # Output: each Due faculty member with up to 5 observers from the Due pool
    with engine.connect() as conn:
        return generate_due_matches(conn, cycle_id)
