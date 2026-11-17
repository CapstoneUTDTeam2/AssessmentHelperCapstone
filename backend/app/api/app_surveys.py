"""App improvement survey: what to improve in the app and what worked, one per observation per role.

Only observations signed by both get one, so a missing report never shows a survey.
It stays open until the cycle's app feedback deadline (AppSurveyResponse trigger enforces the same date).
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.cycle_deadlines import campus_now, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["app-surveys"])

STATUS_COMPLETED = "Completed"

OBSERVATION_COLUMNS = """
    o.observationid, o.status, o.observationdate,
    o.observeeid, ee.professorname AS observeename,
    o.observerprofessorid, obs.professorname AS observername,
    os.cycleid, s.sectionname, c.coursecode
FROM Observation o
JOIN Professors ee ON o.ObserveeID = ee.ProfessorID
JOIN Professors obs ON o.ObserverProfessorID = obs.ProfessorID
JOIN ObservationSignup os ON o.SignupID = os.SignupID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
"""
PROFESSOR_OBSERVATIONS_SQL = f"""
SELECT {OBSERVATION_COLUMNS}
WHERE os.CycleID = :cycle_id AND o.Status = 'Completed'
  AND (o.ObserveeID = :professor_id OR o.ObserverProfessorID = :professor_id)
ORDER BY o.ObservationDate, o.ObservationID
"""
CYCLE_OBSERVATIONS_SQL = f"""
SELECT {OBSERVATION_COLUMNS}
WHERE os.CycleID = :cycle_id AND o.Status = 'Completed'
ORDER BY o.ObservationDate, o.ObservationID
"""
OBSERVATION_SQL = f"SELECT {OBSERVATION_COLUMNS} WHERE o.ObservationID = :observation_id"
PROFESSOR_SQL = "SELECT 1 FROM Professors WHERE ProfessorID = :professor_id"
RESPONSES_SQL = """
SELECT r.appresponseid, r.observationid, r.role, r.appimprovements, r.appenjoyments, r.submissiondate
FROM AppSurveyResponse r
JOIN Observation o ON r.ObservationID = o.ObservationID
JOIN ObservationSignup os ON o.SignupID = os.SignupID
WHERE os.CycleID = :cycle_id
ORDER BY r.SubmissionDate, r.AppResponseID
"""
LOCK_SQL = "LOCK TABLE AppSurveyResponse IN SHARE ROW EXCLUSIVE MODE"
NEXT_ID_SQL = "SELECT COALESCE(MAX(AppResponseID), 0) + 1 FROM AppSurveyResponse"
EXISTING_SQL = "SELECT 1 FROM AppSurveyResponse WHERE ObservationID = :observation_id AND Role = :role"
INSERT_SQL = """
INSERT INTO AppSurveyResponse (AppResponseID, ObservationID, Role, AppImprovements, AppEnjoyments, SubmissionDate)
VALUES (:id, :observation_id, :role, :improvements, :enjoyments, :d)
"""


class AppSurveyBody(BaseModel):
    professor_id: int
    observation_id: int
    improvements: str | None = None
    enjoyments: str | None = None


def _role_of(observation, professor_id):
    if observation["observeeid"] == professor_id:
        return "Observee"
    if observation["observerprofessorid"] == professor_id:
        return "Observer"
    return None


def _observation_payload(o):
    return {
        "observation_id": o["observationid"],
        "observation_date": o["observationdate"].isoformat() if o["observationdate"] else None,
        "course_code": o["coursecode"],
        "section_name": o["sectionname"],
        "observee_name": o["observeename"],
        "observer_name": o["observername"],
    }


def _response_payload(r):
    return {
        "app_response_id": r["appresponseid"],
        "improvements": r["appimprovements"],
        "enjoyments": r["appenjoyments"],
        "submitted_on": r["submissiondate"].isoformat() if r["submissiondate"] else None,
    }


def _window(cycle, today):
    return "open" if today <= cycle["appfeedbackdeadline"] else "closed"


def _db_error(error):
    original = getattr(error, "orig", None)
    return str(original if original is not None else error).splitlines()[0]


# What: the app surveys a professor can take this cycle, one per signed observation they were part of.
@router.get("/professors/{professor_id}/app-surveys")
def get_professor_app_surveys(
    professor_id: int,
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: professor_id, optional cycle_id
    # Output: window, due date, and each signed observation with their role and answers if submitted
    today = campus_now().date()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        if conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).first() is None:
            raise HTTPException(status_code=404, detail="Professor not found")
        observations = conn.execute(
            text(PROFESSOR_OBSERVATIONS_SQL), {"cycle_id": cycle["cycleid"], "professor_id": professor_id}
        ).mappings().all()
        responses = {
            (r["observationid"], r["role"]): r
            for r in conn.execute(text(RESPONSES_SQL), {"cycle_id": cycle["cycleid"]}).mappings()
        }
    surveys = []
    for o in observations:
        role = _role_of(o, professor_id)
        response = responses.get((o["observationid"], role))
        surveys.append(
            {
                **_observation_payload(o),
                "role": role,
                "submitted": response is not None,
                "response": _response_payload(response) if response else None,
            }
        )
    return {
        "professor_id": professor_id,
        "cycle_id": cycle["cycleid"],
        "window": _window(cycle, today),
        "due": cycle["appfeedbackdeadline"].isoformat(),
        "surveys": surveys,
    }


# What: an observee or observer submits the app survey for one signed observation.
@router.post("/app-surveys", status_code=201)
def submit_app_survey(body: AppSurveyBody):
    # Input: professor_id, observation_id, improvements, enjoyments
    # Output: the saved response (400 if the report isn't signed by both, they weren't part of it, or it's past the deadline; 409 if already sent)
    today = campus_now().date()
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_SQL))
            observation = conn.execute(text(OBSERVATION_SQL), {"observation_id": body.observation_id}).mappings().first()
            if observation is None:
                raise HTTPException(status_code=404, detail="Observation not found")
            role = _role_of(observation, body.professor_id)
            if role is None:
                raise HTTPException(status_code=400, detail="You weren't part of this observation")
            if observation["status"] != STATUS_COMPLETED:
                raise HTTPException(
                    status_code=400, detail="The app survey opens once both of you have signed the report"
                )
            cycle = resolve_cycle(conn, observation["cycleid"])
            if _window(cycle, today) == "closed":
                raise HTTPException(
                    status_code=400, detail=f"The app survey closed on {cycle['appfeedbackdeadline']}"
                )
            if conn.execute(text(EXISTING_SQL), {"observation_id": body.observation_id, "role": role}).first():
                raise HTTPException(status_code=409, detail="You already submitted the app survey for this observation")
            new_id = conn.execute(text(NEXT_ID_SQL)).scalar_one()
            conn.execute(
                text(INSERT_SQL),
                {
                    "id": new_id,
                    "observation_id": body.observation_id,
                    "role": role,
                    "improvements": (body.improvements or "").strip() or None,
                    "enjoyments": (body.enjoyments or "").strip() or None,
                    "d": today,
                },
            )
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error(error))
    return {
        "professor_id": body.professor_id,
        "observation_id": body.observation_id,
        "role": role,
        "app_response_id": new_id,
        "improvements": (body.improvements or "").strip() or None,
        "enjoyments": (body.enjoyments or "").strip() or None,
        "submitted_on": today.isoformat(),
    }


# What: every app survey response this cycle, and who with a signed report hasn't answered, for the committee.
@router.get("/app-surveys")
def list_app_survey_responses(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: responses with the observation they're about, plus who still hasn't answered
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        observations = {
            o["observationid"]: o
            for o in conn.execute(text(CYCLE_OBSERVATIONS_SQL), {"cycle_id": cycle["cycleid"]}).mappings()
        }
        rows = conn.execute(text(RESPONSES_SQL), {"cycle_id": cycle["cycleid"]}).mappings().all()
    done = {(r["observationid"], r["role"]) for r in rows}
    responses = []
    for r in rows:
        o = observations.get(r["observationid"])
        if o is None:
            continue
        responses.append(
            {
                **_observation_payload(o),
                "role": r["role"],
                "professor_name": o["observeename"] if r["role"] == "Observee" else o["observername"],
                **_response_payload(r),
            }
        )
    not_submitted = [
        {
            **_observation_payload(o),
            "role": role,
            "professor_name": o["observeename"] if role == "Observee" else o["observername"],
        }
        for o in observations.values()
        for role in ("Observee", "Observer")
        if (o["observationid"], role) not in done
    ]
    return {
        "cycle_id": cycle["cycleid"],
        "due": cycle["appfeedbackdeadline"].isoformat(),
        "response_count": len(responses),
        "responses": responses,
        "not_submitted": not_submitted,
    }
