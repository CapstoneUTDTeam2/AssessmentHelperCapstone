from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.cycle_deadlines import campus_now, resolve_cycle
from app.api.templates import RATING_SCALE
from app.db import engine

router = APIRouter(prefix="/api", tags=["observations"])

NOT_APPLICABLE = 6
LOW_RATINGS = (1, 2)
STATUS_COMPLETED = "Completed"

OBSERVATION_COLUMNS = """
    o.observationid, o.signupid, o.observationdate, o.scheduleddate, o.scheduledtime,
    o.completeddate, o.completedtime, o.status, o.notes, o.templateid,
    o.observersigned, o.observeesigned,
    o.observerprofessorid, obs.professorname AS observername,
    o.observeeid, ee.professorname AS observeename, ee.currentlevel AS observeelevel,
    os.cycleid, at.semester, at.yearnum,
    s.sectionid, s.sectionname, s.meetingdays, s.starttime, s.endtime,
    c.coursecode, c.coursename,
    t.templateversion
FROM Observation o
JOIN Professors obs ON o.ObserverProfessorID = obs.ProfessorID
JOIN Professors ee ON o.ObserveeID = ee.ProfessorID
JOIN ObservationSignup os ON o.SignupID = os.SignupID
JOIN EvaluationCycle ec ON os.CycleID = ec.CycleID
JOIN AcademicTerm at ON ec.TermID = at.TermID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
JOIN ObservationTemplate t ON o.TemplateID = t.TemplateID
"""

OBSERVATION_SQL = f"SELECT {OBSERVATION_COLUMNS} WHERE o.ObservationID = :observation_id"
CYCLE_OBSERVATIONS_SQL = f"""
SELECT {OBSERVATION_COLUMNS}
WHERE os.CycleID = :cycle_id
  AND (CAST(:status AS TEXT) IS NULL OR o.Status = CAST(:status AS TEXT))
ORDER BY COALESCE(o.ObservationDate, o.ScheduledDate), o.ObservationID
"""
PROFESSOR_OBSERVATIONS_SQL = f"""
SELECT {OBSERVATION_COLUMNS}
WHERE o.ObserveeID = :professor_id OR o.ObserverProfessorID = :professor_id
ORDER BY COALESCE(o.ObservationDate, o.ScheduledDate) DESC, o.ObservationID DESC
"""
PROFESSOR_SQL = "SELECT professorid FROM Professors WHERE professorid = :professor_id"

CRITERIA_WITH_RATINGS_SQL = """
SELECT
    ec.criterionid, ec.criterionname, ec.description, ec.sectionid, ec.displayorder,
    ec.isactive, ec.isrequired, ec.notesonlowrating,
    ARRAY(SELECT b.BulletText FROM EvaluationCriterionBullet b WHERE b.CriterionID = ec.CriterionID ORDER BY b.BulletOrder) AS bullets,
    r.rating, r.comments
FROM Observation o
JOIN EvaluationCriterion ec ON ec.TemplateID = o.TemplateID
LEFT JOIN ObservationCriterionRating r ON r.ObservationID = o.ObservationID AND r.CriterionID = ec.CriterionID
WHERE o.ObservationID = :observation_id
  AND (ec.IsActive OR r.Rating IS NOT NULL)
ORDER BY ec.DisplayOrder, ec.CriterionID
"""

LOCK_OBSERVATION_SQL = "SELECT 1 FROM Observation WHERE ObservationID = :observation_id FOR UPDATE"
UPSERT_RATING_SQL = """
INSERT INTO ObservationCriterionRating (ObservationID, CriterionID, TemplateID, Rating, Comments)
VALUES (:observation_id, :criterion_id, :template_id, :rating, :comment)
ON CONFLICT (ObservationID, CriterionID)
DO UPDATE SET Rating = EXCLUDED.Rating, Comments = EXCLUDED.Comments
"""
UPDATE_NOTES_SQL = "UPDATE Observation SET Notes = :notes WHERE ObservationID = :observation_id"
SIGN_OBSERVER_SQL = "UPDATE Observation SET ObserverSigned = TRUE WHERE ObservationID = :observation_id"
SIGN_OBSERVEE_SQL = "UPDATE Observation SET ObserveeSigned = TRUE WHERE ObservationID = :observation_id"
COMPLETE_SQL = """
UPDATE Observation
SET Status = 'Completed', CompletedDate = :d, CompletedTime = :t,
    ObservationDate = COALESCE(ObservationDate, ScheduledDate)
WHERE ObservationID = :observation_id
"""


class RatingEntry(BaseModel):
    criterion_id: int
    rating: int | None = None
    comment: str | None = None


class RatingsBody(BaseModel):
    observer_id: int
    ratings: list[RatingEntry] = []
    summary: str | None = None


class SignBody(BaseModel):
    professor_id: int


def _time_str(value):
    return value.strftime("%H:%M") if value is not None and hasattr(value, "strftime") else value


def _db_error(error):
    original = getattr(error, "orig", None)
    return str(original if original is not None else error).splitlines()[0]


def _observation_date(row):
    return row["observationdate"] or row["scheduleddate"]


def _summary_payload(row):
    when = _observation_date(row)
    completed = None
    if row["completeddate"] is not None:
        completed = (
            datetime.combine(row["completeddate"], row["completedtime"]).isoformat()
            if row["completedtime"] is not None else row["completeddate"].isoformat()
        )
    return {
        "observation_id": row["observationid"],
        "signup_id": row["signupid"],
        "cycle_id": row["cycleid"],
        "semester": row["semester"],
        "year": row["yearnum"],
        "status": row["status"],
        "observation_date": when.isoformat() if when else None,
        "start_time": _time_str(row["scheduledtime"] or row["starttime"]),
        "end_time": _time_str(row["endtime"]),
        "observee_id": row["observeeid"],
        "observee_name": row["observeename"],
        "observee_level": row["observeelevel"],
        "observer_id": row["observerprofessorid"],
        "observer_name": row["observername"],
        "course_code": row["coursecode"],
        "course_name": row["coursename"],
        "section_id": row["sectionid"],
        "section_name": row["sectionname"],
        "meeting_days": row["meetingdays"],
        "template_id": row["templateid"],
        "template_version": row["templateversion"],
        "observer_signed": row["observersigned"],
        "observee_signed": row["observeesigned"],
        "locked": row["status"] == STATUS_COMPLETED,
        "completed_at": completed,
    }


def _criteria(conn, observation_id):
    rows = conn.execute(text(CRITERIA_WITH_RATINGS_SQL), {"observation_id": observation_id}).mappings().all()
    return [
        {
            "criterion_id": r["criterionid"],
            "name": r["criterionname"],
            "description": r["description"],
            "section_id": r["sectionid"],
            "bullets": list(r["bullets"] or []),
            "is_required": r["isrequired"],
            "notes_on_low_rating": r["notesonlowrating"],
            "rating": r["rating"],
            "not_applicable": r["rating"] == NOT_APPLICABLE,
            "comment": r["comments"],
        }
        for r in rows
    ]


def _missing_for_signing(criteria):
    # Every active required criterion needs a rating, and a low rating needs a comment when the criterion asks for one.
    problems = []
    for c in criteria:
        if c["is_required"] and c["rating"] is None:
            problems.append(f"{c['name']} needs a rating")
        elif c["notes_on_low_rating"] and c["rating"] in LOW_RATINGS and not (c["comment"] or "").strip():
            problems.append(f"{c['name']} was rated {c['rating']}, so it needs a comment")
    return problems


def _detail(conn, observation_id):
    row = conn.execute(text(OBSERVATION_SQL), {"observation_id": observation_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Observation not found")
    criteria = _criteria(conn, observation_id)
    return row, {
        **_summary_payload(row),
        "summary": row["notes"],
        "rating_scale": RATING_SCALE,
        "criteria": criteria,
        "ready_to_sign": not _missing_for_signing(criteria),
        "missing": _missing_for_signing(criteria),
    }


# What: observations in a cycle, for the committee (AHC-281).
@router.get("/observations")
def list_observations(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
    status: str | None = Query(default=None, description="Scheduled or Completed"),
):
    # Input: optional cycle_id, optional status
    # Output: each observation with who, when, and whether both people signed
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        rows = conn.execute(
            text(CYCLE_OBSERVATIONS_SQL), {"cycle_id": cycle["cycleid"], "status": status}
        ).mappings().all()
    items = [_summary_payload(r) for r in rows]
    return {
        "cycle_id": cycle["cycleid"],
        "completed_count": sum(1 for i in items if i["status"] == STATUS_COMPLETED),
        "observations": items,
    }


# What: one observation report with the template criteria, ratings, comments, and signatures (AHC-281).
@router.get("/observations/{observation_id}")
def get_observation(observation_id: int):
    # Input: observation_id
    # Output: the full report
    with engine.connect() as conn:
        return _detail(conn, observation_id)[1]


# What: a professor's observations, both the ones they received and the ones they gave.
@router.get("/professors/{professor_id}/observations")
def list_professor_observations(professor_id: int):
    # Input: professor_id
    # Output: received and given observations, newest first, and which ones still need their signature
    with engine.connect() as conn:
        if conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).first() is None:
            raise HTTPException(status_code=404, detail="Professor not found")
        rows = conn.execute(text(PROFESSOR_OBSERVATIONS_SQL), {"professor_id": professor_id}).mappings().all()
    received, given = [], []
    for row in rows:
        item = _summary_payload(row)
        if row["observeeid"] == professor_id:
            item["needs_my_signature"] = item["status"] != STATUS_COMPLETED and not row["observeesigned"]
            received.append(item)
        else:
            item["needs_my_signature"] = item["status"] != STATUS_COMPLETED and not row["observersigned"]
            given.append(item)
    return {"professor_id": professor_id, "received": received, "given": given}


# What: the observer fills in ratings, comments, and the summary on the observation form.
@router.put("/observations/{observation_id}/ratings")
def save_ratings(observation_id: int, body: RatingsBody):
    # Input: observer_id, ratings [{criterion_id, rating 1-5 or 6 for N/A, comment}], optional summary
    # Output: the updated report (409 once anyone has signed)
    for entry in body.ratings:
        if entry.rating is not None and not 1 <= entry.rating <= NOT_APPLICABLE:
            raise HTTPException(status_code=400, detail="Ratings are 1 to 5, or 6 for Not Applicable")
    if len({e.criterion_id for e in body.ratings}) != len(body.ratings):
        raise HTTPException(status_code=400, detail="Each criterion can only be rated once")
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_OBSERVATION_SQL), {"observation_id": observation_id})
            row, report = _detail(conn, observation_id)
            if row["observerprofessorid"] != body.observer_id:
                raise HTTPException(status_code=403, detail="Only the observer can fill in the form")
            if row["status"] == STATUS_COMPLETED:
                raise HTTPException(status_code=409, detail="This observation is signed and locked")
            if row["observersigned"] or row["observeesigned"]:
                raise HTTPException(status_code=409, detail="The form can't change after someone has signed it")
            valid = {c["criterion_id"] for c in report["criteria"]}
            unknown = [e.criterion_id for e in body.ratings if e.criterion_id not in valid]
            if unknown:
                raise HTTPException(status_code=400, detail=f"Criterion {unknown[0]} isn't on this observation's form")
            for entry in body.ratings:
                conn.execute(
                    text(UPSERT_RATING_SQL),
                    {
                        "observation_id": observation_id,
                        "criterion_id": entry.criterion_id,
                        "template_id": row["templateid"],
                        "rating": entry.rating,
                        "comment": entry.comment,
                    },
                )
            if body.summary is not None:
                conn.execute(text(UPDATE_NOTES_SQL), {"notes": body.summary, "observation_id": observation_id})
            return _detail(conn, observation_id)[1]
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))


# What: the observer or observee signs the observation (AHC-283). Once both sign, it is Completed and locked.
@router.post("/observations/{observation_id}/sign")
def sign_observation(observation_id: int, body: SignBody):
    # Input: professor_id (the observer or the observee)
    # Output: the report with both signature flags; completed once both are true
    now = campus_now().replace(microsecond=0)
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_OBSERVATION_SQL), {"observation_id": observation_id})
            row, report = _detail(conn, observation_id)
            if row["status"] == STATUS_COMPLETED:
                raise HTTPException(status_code=409, detail="This observation is already signed by both people")
            if body.professor_id == row["observerprofessorid"]:
                signed, sql = row["observersigned"], SIGN_OBSERVER_SQL
            elif body.professor_id == row["observeeid"]:
                signed, sql = row["observeesigned"], SIGN_OBSERVEE_SQL
            else:
                raise HTTPException(status_code=403, detail="Only the observer or the observee can sign")
            if signed:
                raise HTTPException(status_code=409, detail="You already signed this observation")
            when = _observation_date(row)
            if when is None or when > now.date():
                raise HTTPException(status_code=400, detail="You can sign once the observation has happened")
            if report["missing"]:
                raise HTTPException(status_code=400, detail="The form isn't finished: " + "; ".join(report["missing"]))
            conn.execute(text(sql), {"observation_id": observation_id})
            other_signed = row["observeesigned"] if sql == SIGN_OBSERVER_SQL else row["observersigned"]
            if other_signed:
                conn.execute(text(COMPLETE_SQL), {"observation_id": observation_id, "d": now.date(), "t": now.time()})
            return _detail(conn, observation_id)[1]
    except DBAPIError as error:
        raise HTTPException(status_code=409, detail=_db_error(error))
