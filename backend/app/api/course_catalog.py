from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.api.observee_classes import _load_current_term, _time_str
from app.db import engine

router = APIRouter(prefix="/api", tags=["course-catalog"])

COURSES_SQL = """
SELECT
    c.courseid,
    c.coursecode,
    c.coursename,
    c.coursedescription,
    s.sectionid,
    s.sectionname,
    s.meetingdays,
    s.starttime,
    s.endtime,
    p.professorid,
    p.professorname
FROM Courses c
LEFT JOIN Sections s ON s.CourseID = c.CourseID AND s.TermID = :term_id
LEFT JOIN TeachingAssignment ta ON ta.SectionID = s.SectionID
LEFT JOIN Professors p ON p.ProfessorID = ta.ProfessorID
ORDER BY c.coursecode, s.sectionname, p.professorname
"""


def _empty_course(row):
    return {
        "course_id": row["courseid"],
        "course_code": row["coursecode"],
        "course_name": row["coursename"],
        "course_description": row["coursedescription"],
        "sections": [],
    }


def _load_catalog(term_id: int, course_id: int | None = None):
    sql = COURSES_SQL
    params = {"term_id": term_id}
    if course_id is not None:
        sql = COURSES_SQL.replace(
            "ORDER BY",
            "WHERE c.CourseID = :course_id\nORDER BY",
            1,
        )
        params["course_id"] = course_id

    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()

    courses = []
    by_id = {}
    for row in rows:
        course = by_id.get(row["courseid"])
        if course is None:
            course = _empty_course(row)
            by_id[row["courseid"]] = course
            courses.append(course)
        if row["sectionid"] is None:
            continue
        section = next(
            (item for item in course["sections"] if item["section_id"] == row["sectionid"]),
            None,
        )
        if section is None:
            section = {
                "section_id": row["sectionid"],
                "section_name": row["sectionname"],
                "meeting_days": row["meetingdays"],
                "start_time": _time_str(row["starttime"]),
                "end_time": _time_str(row["endtime"]),
                "instructors": [],
            }
            course["sections"].append(section)
        if row["professorid"] is not None:
            instructor = {
                "professor_id": row["professorid"],
                "professor_name": row["professorname"],
            }
            if instructor not in section["instructors"]:
                section["instructors"].append(instructor)
    return courses


# What: course catalog for the current evaluation-cycle term (AHC-354).
@router.get("/courses")
def list_courses():
    # Input: none (uses the current cycle term)
    # Output: every course (code, name, description) plus that term's sections
    term = _load_current_term()
    return {
        "semester": term["semester"],
        "year": term["year"],
        "courses": _load_catalog(term["term_id"]),
    }


# What: one course and its current-term sections.
@router.get("/courses/{course_id}")
def get_course(course_id: int):
    # Input: course_id
    # Output: that course, or 404
    term = _load_current_term()
    courses = _load_catalog(term["term_id"], course_id)
    if not courses:
        raise HTTPException(status_code=404, detail="Course not found")
    return {
        "semester": term["semester"],
        "year": term["year"],
        **courses[0],
    }
