from fastapi import APIRouter, Query
from sqlalchemy import text

from app.api.cycle_deadlines import campus_now, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["kpis"])

FULL_LIST = 5

# AHC-300: every saved match is checked against the process doc's list of incorrect matches:
# the same professor, a different department, a different course level (taught in the last four
# Fall/Spring terms), or teaching at the observee's class time.
MATCH_CHECK_SQL = """
WITH ranked_terms AS (
    SELECT t.TermID,
           ROW_NUMBER() OVER (ORDER BY t.YearNum DESC,
                              CASE t.Semester WHEN 'Fall' THEN 2 WHEN 'Spring' THEN 1 END DESC) AS term_rank
    FROM AcademicTerm t
    WHERE t.Semester IN ('Fall', 'Spring')
),
matches AS (
    SELECT sol.SignupID, sol.ObserverProfessorID, os.ObserveeProfessorID,
           ee.ProfessorDepartment AS observee_dept, obs.ProfessorDepartment AS observer_dept,
           s.TermID, s.MeetingDays, s.StartTime, s.EndTime,
           LEFT(SPLIT_PART(c.CourseCode, ' ', 2), 1) AS level
    FROM SignupObserverList sol
    JOIN ObservationSignup os ON sol.SignupID = os.SignupID
    JOIN Professors ee ON os.ObserveeProfessorID = ee.ProfessorID
    JOIN Professors obs ON sol.ObserverProfessorID = obs.ProfessorID
    JOIN Sections s ON os.SectionID = s.SectionID
    JOIN Courses c ON s.CourseID = c.CourseID
    WHERE os.CycleID = :cycle_id
)
SELECT
    m.signupid, m.observerprofessorid,
    m.ObserverProfessorID = m.ObserveeProfessorID AS same_person,
    m.observer_dept IS DISTINCT FROM m.observee_dept AS other_department,
    NOT EXISTS (
        SELECT 1
        FROM TeachingAssignment ta
        JOIN Sections s2 ON s2.SectionID = ta.SectionID
        JOIN Courses c2 ON c2.CourseID = s2.CourseID
        JOIN ranked_terms h ON h.TermID = s2.TermID
        JOIN ranked_terms cur ON cur.TermID = m.TermID
        WHERE ta.ProfessorID = m.ObserverProfessorID
          AND h.term_rank BETWEEN cur.term_rank AND cur.term_rank + 3
          AND LEFT(SPLIT_PART(c2.CourseCode, ' ', 2), 1) = m.level
    ) AS other_level,
    EXISTS (
        SELECT 1
        FROM TeachingAssignment ta
        JOIN Sections s2 ON s2.SectionID = ta.SectionID
        WHERE ta.ProfessorID = m.ObserverProfessorID
          AND s2.TermID = m.TermID
          AND s2.StartTime < m.EndTime AND s2.EndTime > m.StartTime
          AND EXISTS (
              SELECT 1 FROM regexp_split_to_table(COALESCE(s2.MeetingDays, ''), '') d
              WHERE d <> '' AND POSITION(d IN COALESCE(m.MeetingDays, '')) > 0
          )
    ) AS busy_at_class_time
FROM matches m
ORDER BY m.SignupID, m.ObserverProfessorID
"""

STATUS_COUNTS_SQL = """
SELECT EvaluationStatus AS status, CurrentLevel AS level, COUNT(*) AS n
FROM ProfessorEvaluationStatus
GROUP BY EvaluationStatus, CurrentLevel
"""

CYCLE_FACTS_SQL = """
SELECT
    (SELECT COUNT(DISTINCT os.ObserveeProfessorID) FROM ObservationSignup os WHERE os.CycleID = :cycle_id) AS signed_up,
    (SELECT COUNT(*) FROM ObservationSignup os WHERE os.CycleID = :cycle_id) AS signups,
    (SELECT COUNT(DISTINCT o.ObserverProfessorID) FROM Observation o
       JOIN ObservationSignup os ON o.SignupID = os.SignupID WHERE os.CycleID = :cycle_id) AS observers,
    (SELECT COUNT(*) FROM SignupObserverList sol
       JOIN ObservationSignup os ON sol.SignupID = os.SignupID WHERE os.CycleID = :cycle_id) AS saved_matches,
    (SELECT COUNT(DISTINCT sol.SignupID) FROM SignupObserverList sol
       JOIN ObservationSignup os ON sol.SignupID = os.SignupID WHERE os.CycleID = :cycle_id) AS signups_with_list,
    (SELECT COUNT(*) FROM PostObservationSurveyResponse r WHERE r.CycleID = :cycle_id) AS surveys
"""

MISSING_SQL = """
SELECT o.observationid, o.signupid, ee.professorname AS observee, obs.professorname AS observer,
       COALESCE(o.ObservationDate, o.ScheduledDate) AS planned, o.status
FROM Observation o
JOIN ObservationSignup os ON o.SignupID = os.SignupID
JOIN Professors ee ON o.ObserveeID = ee.ProfessorID
JOIN Professors obs ON o.ObserverProfessorID = obs.ProfessorID
WHERE os.CycleID = :cycle_id
  AND o.Status IS DISTINCT FROM 'Completed'
  AND COALESCE(o.ObservationDate, o.ScheduledDate) < :today
ORDER BY planned, o.ObservationID
"""

# Process doc: sign up AND sent request(s) AND had 1 request confirmed AND was observed AND took the final survey.
FULL_PROCESS_SQL = """
SELECT COUNT(*)
FROM ObservationSignup os
WHERE os.CycleID = :cycle_id
  AND EXISTS (SELECT 1 FROM ObserverRequest r WHERE r.SignupID = os.SignupID)
  AND EXISTS (SELECT 1 FROM ObserverRequest r WHERE r.SignupID = os.SignupID AND r.Status IN ('Accepted', 'Not Selected'))
  AND EXISTS (SELECT 1 FROM Observation o WHERE o.SignupID = os.SignupID AND o.Status = 'Completed')
  AND EXISTS (
      SELECT 1 FROM PostObservationSurveyResponse sr
      WHERE sr.CycleID = os.CycleID AND sr.ProfessorID = os.ObserveeProfessorID AND sr.Role = 'Observee'
  )
"""

OUTSTANDING_BY_LEVEL_SQL = """
SELECT ee.CurrentLevel AS level, COUNT(*) AS n
FROM Observation o
JOIN ObservationSignup os ON o.SignupID = os.SignupID
JOIN Professors ee ON o.ObserveeID = ee.ProfessorID
WHERE os.CycleID = :cycle_id AND o.Status IS DISTINCT FROM 'Completed'
GROUP BY ee.CurrentLevel
"""

UNMATCHED_SQL = """
SELECT
    os.signupid, os.status, os.observeeprofessorid, p.professorname, p.currentlevel,
    c.coursecode, s.sectionname,
    (SELECT COUNT(*) FROM get_eligible_observers(os.SignupID)) AS eligible_count,
    (SELECT COUNT(*) FROM SignupObserverList sol WHERE sol.SignupID = os.SignupID) AS list_size,
    (SELECT COUNT(*) FROM ObserverRequest r WHERE r.SignupID = os.SignupID) AS requests_sent,
    (SELECT COUNT(*) FROM ObserverRequest r WHERE r.SignupID = os.SignupID AND r.Status = 'Accepted') AS confirmed,
    (SELECT COUNT(*) FROM ObserverRequest r WHERE r.SignupID = os.SignupID
       AND (r.Status = 'Declined'
            OR (r.Status = 'Pending' AND (r.ExpirationDate + r.ExpirationTime) < :now))) AS declined_or_expired
FROM ObservationSignup os
JOIN Professors p ON os.ObserveeProfessorID = p.ProfessorID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
WHERE os.CycleID = :cycle_id
  AND NOT EXISTS (SELECT 1 FROM Observation o WHERE o.SignupID = os.SignupID)
ORDER BY os.SignupID
"""


def _rate(numerator, denominator):
    if not denominator:
        return None
    return round(100.0 * numerator / denominator, 1)


def _level_counts(rows, statuses):
    counts = {}
    for row in rows:
        if row["status"] in statuses:
            level = row["level"] or "Unknown"
            counts[level] = counts.get(level, 0) + row["n"]
    return counts


def eligibility_accuracy(conn, cycle_id):
    rows = conn.execute(text(MATCH_CHECK_SQL), {"cycle_id": cycle_id}).mappings().all()
    incorrect = []
    for row in rows:
        reasons = [
            label
            for key, label in (
                ("same_person", "same professor"),
                ("other_department", "different department"),
                ("other_level", "different course level"),
                ("busy_at_class_time", "teaching during the class time"),
            )
            if row[key]
        ]
        if reasons:
            incorrect.append({"signup_id": row["signupid"], "observer_id": row["observerprofessorid"], "reasons": reasons})
    total = len(rows)
    return {
        "total_matches": total,
        "correct_matches": total - len(incorrect),
        "percent": _rate(total - len(incorrect), total),
        "incorrect": incorrect,
    }


def unmatched_faculty(conn, cycle_id):
    rows = conn.execute(
        text(UNMATCHED_SQL), {"cycle_id": cycle_id, "now": campus_now().replace(microsecond=0)}
    ).mappings().all()
    report = []
    for row in rows:
        if row["eligible_count"] == 0:
            reason = "No eligible observers"
        elif row["requests_sent"] and row["confirmed"] == 0 and row["declined_or_expired"] == row["requests_sent"]:
            reason = "Every request was declined or expired"
        elif row["requests_sent"] == 0:
            reason = "No requests sent yet"
        else:
            reason = "Waiting on observers to confirm" if row["confirmed"] == 0 else "Waiting on the observee to choose"
        report.append(
            {
                "signup_id": row["signupid"],
                "status": row["status"],
                "professor_id": row["observeeprofessorid"],
                "professor_name": row["professorname"],
                "hire_level": row["currentlevel"],
                "course_code": row["coursecode"],
                "section_name": row["sectionname"],
                "eligible_count": row["eligible_count"],
                "list_size": row["list_size"],
                "requests_sent": row["requests_sent"],
                "confirmed": row["confirmed"],
                "reason": reason,
            }
        )
    return report


# What: the project KPIs for a cycle (AHC-300 to AHC-306).
@router.get("/kpis")
def get_kpis(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: each KPI with the counts behind it
    today = campus_now().date()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        cid = cycle["cycleid"]
        status_rows = conn.execute(text(STATUS_COUNTS_SQL)).mappings().all()
        facts = conn.execute(text(CYCLE_FACTS_SQL), {"cycle_id": cid}).mappings().first()
        missing = conn.execute(text(MISSING_SQL), {"cycle_id": cid, "today": today}).mappings().all()
        full_process = conn.execute(text(FULL_PROCESS_SQL), {"cycle_id": cid}).scalar_one()
        accuracy = eligibility_accuracy(conn, cid)

    due = sum(_level_counts(status_rows, ("Due", "Overdue")).values())
    overdue = sum(_level_counts(status_rows, ("Overdue",)).values())
    return {
        "cycle_id": cid,
        "semester": cycle["semester"],
        "year": cycle["yearnum"],
        "evaluation_eligibility_accuracy": accuracy,
        "overdue_evaluation_count": {"count": overdue},
        "assessment_participation_rate": {
            "signed_up": facts["signed_up"],
            "due": due,
            "percent": _rate(facts["signed_up"], due),
        },
        "observer_utilization_rate": {
            "observers": facts["observers"],
            "signed_up": facts["signed_up"],
            "percent": _rate(facts["observers"], facts["signed_up"]),
        },
        "list_sufficiency_rate": {
            "saved_matches": facts["saved_matches"],
            "signups": facts["signups"],
            "average_list_size": round(facts["saved_matches"] / facts["signups"], 2) if facts["signups"] else None,
            "percent_of_full_list": _rate(facts["saved_matches"], facts["signups"] * FULL_LIST),
        },
        "missing_observation_count": {
            "count": len(missing),
            "observations": [
                {
                    "observation_id": m["observationid"],
                    "signup_id": m["signupid"],
                    "observee": m["observee"],
                    "observer": m["observer"],
                    "planned_date": m["planned"].isoformat() if m["planned"] else None,
                    "status": m["status"],
                }
                for m in missing
            ],
        },
        "survey_completion_rate": {
            "completed_full_process": full_process,
            "submitted_surveys": facts["surveys"],
            "signups": facts["signups"],
            "percent": _rate(full_process, facts["signups"]),
        },
    }


# What: unmatched faculty report, signups that still have no observer (AHC-308).
@router.get("/reports/unmatched-faculty")
def get_unmatched_faculty(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: each signup without an observer and why
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        report = unmatched_faculty(conn, cycle["cycleid"])
    return {"cycle_id": cycle["cycleid"], "count": len(report), "faculty": report}


# What: executive dashboard numbers for the committee (AHC-307).
@router.get("/dashboard/executive")
def get_executive_dashboard(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: faculty due by hire level, outstanding observation reports by hire level, unmatched faculty
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        status_rows = conn.execute(text(STATUS_COUNTS_SQL)).mappings().all()
        outstanding = conn.execute(text(OUTSTANDING_BY_LEVEL_SQL), {"cycle_id": cycle["cycleid"]}).mappings().all()
        unmatched = unmatched_faculty(conn, cycle["cycleid"])
    return {
        "cycle_id": cycle["cycleid"],
        "faculty_due_by_hire_level": _level_counts(status_rows, ("Due", "Overdue")),
        "faculty_overdue_by_hire_level": _level_counts(status_rows, ("Overdue",)),
        "outstanding_reports_by_hire_level": {(r["level"] or "Unknown"): r["n"] for r in outstanding},
        "unmatched_faculty_count": len(unmatched),
        "unmatched_faculty": unmatched,
    }
