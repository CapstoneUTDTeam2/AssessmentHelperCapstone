from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.db import engine

router = APIRouter(prefix="/api", tags=["observee-classes"])

PROFESSOR_SQL = """
SELECT professorid, professorname
FROM Professors
WHERE professorid = :professor_id
"""

# Current semester is the latest Spring/Fall EvaluationCycle term.
CURRENT_TERM_SQL = """
SELECT at.termid, at.semester, at.yearnum
FROM EvaluationCycle ec
JOIN AcademicTerm at ON ec.TermID = at.TermID
WHERE at.Semester IN ('Spring', 'Fall')
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Fall' THEN 2 END DESC
LIMIT 1
"""

CLASSES_SQL = """
SELECT
    c.courseid,
    c.coursecode,
    c.coursename,
    s.sectionid,
    s.sectionname,
    s.meetingdays,
    s.starttime,
    s.endtime
FROM TeachingAssignment ta
JOIN Sections s ON ta.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE ta.ProfessorID = :professor_id
  AND s.TermID = :term_id
ORDER BY c.coursecode, s.sectionname
"""

HISTORY_SQL = """
SELECT
    at.termid,
    at.semester,
    at.yearnum,
    c.courseid,
    c.coursecode,
    c.coursename,
    s.sectionid,
    s.sectionname,
    s.meetingdays,
    s.starttime,
    s.endtime
FROM TeachingAssignment ta
JOIN Sections s ON ta.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
JOIN AcademicTerm at ON s.TermID = at.TermID
WHERE ta.ProfessorID = :professor_id
ORDER BY at.YearNum DESC,
    CASE at.Semester WHEN 'Spring' THEN 1 WHEN 'Summer' THEN 2 WHEN 'Fall' THEN 3 END DESC,
    c.coursecode, s.sectionname
"""


def _time_str(value):
    if value is None:
        return None
    return value.strftime("%H:%M") if hasattr(value, "strftime") else str(value)


def _load_professor(professor_id: int):
    with engine.connect() as conn:
        row = conn.execute(
            text(PROFESSOR_SQL), {"professor_id": professor_id}
        ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Professor not found")
    return {"professor_id": row["professorid"], "professor_name": row["professorname"]}


def _load_current_term():
    with engine.connect() as conn:
        row = conn.execute(text(CURRENT_TERM_SQL)).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="No evaluation cycle found")
    return {
        "term_id": row["termid"],
        "semester": row["semester"],
        "year": row["yearnum"],
    }


def _class_payload(row):
    return {
        "course_id": row["courseid"],
        "course_code": row["coursecode"],
        "course_name": row["coursename"],
        "section_id": row["sectionid"],
        "section_name": row["sectionname"],
        "meeting_days": row["meetingdays"],
        "start_time": _time_str(row["starttime"]),
        "end_time": _time_str(row["endtime"]),
    }


def _load_classes(professor_id: int, term_id: int):
    with engine.connect() as conn:
        rows = conn.execute(
            text(CLASSES_SQL),
            {"professor_id": professor_id, "term_id": term_id},
        ).mappings().all()
    return [_class_payload(row) for row in rows]


def _load_teaching_history(professor_id: int):
    with engine.connect() as conn:
        rows = conn.execute(
            text(HISTORY_SQL), {"professor_id": professor_id}
        ).mappings().all()
    terms = []
    by_term = {}
    for row in rows:
        term = by_term.get(row["termid"])
        if term is None:
            term = {
                "term_id": row["termid"],
                "semester": row["semester"],
                "year": row["yearnum"],
                "courses": [],
                "sections": 0,
                "classes": [],
            }
            by_term[row["termid"]] = term
            terms.append(term)
        payload = _class_payload(row)
        term["classes"].append(payload)
        term["sections"] += 1
        if payload["course_code"] not in term["courses"]:
            term["courses"].append(payload["course_code"])
    return terms


@router.get("/observees/{professor_id}/classes")
def get_observee_current_classes(professor_id: int):
    # What: classes this observee teaches in the current evaluation-cycle semester
    # Input: professor_id from the URL
    # Output: observee, current term, and that term's sections (empty list if none)
    professor = _load_professor(professor_id)
    term = _load_current_term()
    return {
        **professor,
        "semester": term["semester"],
        "year": term["year"],
        "classes": _load_classes(professor_id, term["term_id"]),
    }


# What: every term this professor has taught, grouped newest first (AHC-354).
@router.get("/observees/{professor_id}/teaching-history")
def get_observee_teaching_history(professor_id: int):
    # Input: professor_id from the URL
    # Output: observee plus terms with course codes and the same class rows as /classes
    professor = _load_professor(professor_id)
    return {**professor, "terms": _load_teaching_history(professor_id)}
