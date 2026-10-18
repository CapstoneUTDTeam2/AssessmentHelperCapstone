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

# Pool members in the same department, with every section they teach this term.
CANDIDATES_SQL = """
SELECT
    p.professorid,
    p.professorname,
    d.departmentname,
    s.meetingdays,
    s.starttime,
    s.endtime,
    c.coursecode
FROM Professors p
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
JOIN TeachingAssignment ta ON ta.ProfessorID = p.ProfessorID
JOIN Sections s ON ta.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE p.ProfessorID <> :faculty_id
  AND p.ProfessorDepartment = :department_id
  AND s.TermID = :term_id
  AND EXISTS (
      SELECT 1
      FROM ObservationSignup os
      WHERE os.ObserveeProfessorID = p.ProfessorID
        AND os.CycleID = :cycle_id
  )
ORDER BY p.professorname, s.sectionid
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


def _eligible_observers(rows, course_lvl, requested_days, window_start, window_end, point_only):
    by_professor = {}
    for row in rows:
        entry = by_professor.setdefault(
            row["professorid"],
            {
                "observer_id": row["professorid"],
                "name": row["professorname"],
                "department": row["departmentname"],
                "levels": set(),
                "busy": False,
            },
        )
        level = course_level(row["coursecode"])
        if level is not None:
            entry["levels"].add(level)
        if is_busy(
            row["meetingdays"],
            parse_clock(row["starttime"]),
            parse_clock(row["endtime"]),
            requested_days,
            window_start,
            window_end,
            point_only,
        ):
            entry["busy"] = True

    eligible = [
        {
            "observer_id": entry["observer_id"],
            "name": entry["name"],
            "department": entry["department"],
        }
        for entry in by_professor.values()
        if course_lvl in entry["levels"] and not entry["busy"]
    ]
    eligible.sort(key=lambda item: item["name"])
    return eligible


def _pick_observers(eligible):
    if len(eligible) <= MAX_MATCHES:
        return eligible
    return sorted(random.sample(eligible, MAX_MATCHES), key=lambda item: item["name"])


def build_match_result(conn, faculty_id, section, cycle, requested_day=None, requested_time=None, signup_id=None):
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

    rows = conn.execute(
        text(CANDIDATES_SQL),
        {
            "faculty_id": faculty_id,
            "department_id": observee["departmentid"],
            "term_id": cycle["termid"],
            "cycle_id": cycle["cycleid"],
        },
    ).mappings().all()

    eligible = _eligible_observers(
        rows, level, requested_days, window_start, window_end, point_only
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
