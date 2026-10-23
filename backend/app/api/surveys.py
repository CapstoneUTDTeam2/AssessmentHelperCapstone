from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.cycle_deadlines import campus_now, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["surveys"])

ROLES = ("Observee", "Observer")
# ProcessStatus holds the answer to "was this process ok or not".
PROCESS_OK = "Satisfied"
PROCESS_NOT_OK = "Not Satisfied"

PROFESSOR_SQL = "SELECT professorid, professorname FROM Professors WHERE professorid = :professor_id"
CYCLE_EXTRA_SQL = """
SELECT postobservationfeedbackdeadline, surveynotificationsentat
FROM EvaluationCycle WHERE CycleID = :cycle_id
"""
OBSERVEE_SIGNUP_SQL = """
SELECT signupid FROM ObservationSignup
WHERE CycleID = :cycle_id AND ObserveeProfessorID = :professor_id
ORDER BY SignupID LIMIT 1
"""
OBSERVER_SIGNUP_SQL = """
SELECT os.signupid
FROM Observation o
JOIN ObservationSignup os ON o.SignupID = os.SignupID
WHERE os.CycleID = :cycle_id AND o.ObserverProfessorID = :professor_id
ORDER BY o.ObservationID LIMIT 1
"""
EXISTING_SQL = """
SELECT surveyresponseid, role, submissiondate, submissiontime, processstatus, difficulties, improvementconditions
FROM PostObservationSurveyResponse
WHERE CycleID = :cycle_id AND ProfessorID = :professor_id
"""
LOCK_SQL = "LOCK TABLE PostObservationSurveyResponse IN SHARE ROW EXCLUSIVE MODE"
NEXT_ID_SQL = "SELECT COALESCE(MAX(SurveyResponseID), 0) + 1 FROM PostObservationSurveyResponse"
INSERT_SQL = """
INSERT INTO PostObservationSurveyResponse (
    SurveyResponseID, CycleID, ProfessorID, SignupID, Role, SubmissionDate, SubmissionTime,
    ProcessStatus, Difficulties, ImprovementConditions
)
VALUES (:id, :cycle_id, :professor_id, :signup_id, :role, :d, :t, :process_status, :difficulties, :improvements)
"""
RESPONSES_SQL = """
SELECT r.surveyresponseid, r.professorid, p.professorname, r.signupid, r.role,
       r.submissiondate, r.submissiontime, r.processstatus, r.difficulties, r.improvementconditions
FROM PostObservationSurveyResponse r
JOIN Professors p ON r.ProfessorID = p.ProfessorID
WHERE r.CycleID = :cycle_id
ORDER BY r.SubmissionDate, r.SubmissionTime, r.SurveyResponseID
"""
PARTICIPANTS_SQL = """
SELECT os.ObserveeProfessorID AS professorid, 'Observee' AS role FROM ObservationSignup os WHERE os.CycleID = :cycle_id
UNION
SELECT o.ObserverProfessorID, 'Observer' FROM Observation o
JOIN ObservationSignup os ON o.SignupID = os.SignupID WHERE os.CycleID = :cycle_id
"""
MARK_NOTIFIED_SQL = "UPDATE EvaluationCycle SET SurveyNotificationSentAt = :at WHERE CycleID = :cycle_id"


class SurveyBody(BaseModel):
    professor_id: int
    role: str
    process_ok: bool
    difficulties: str | None = None
    improvements: str | None = None
    cycle_id: int | None = None


def _db_error(error):
    original = getattr(error, "orig", None)
    return str(original if original is not None else error).splitlines()[0]


def _stamp(d, t):
    if d is None:
        return None
    return datetime.combine(d, t).isoformat() if t is not None else d.isoformat()


def _response_payload(row):
    return {
        "survey_response_id": row["surveyresponseid"],
        "role": row["role"],
        "submitted_at": _stamp(row["submissiondate"], row["submissiontime"]),
        "process_ok": None if row["processstatus"] is None else row["processstatus"] == PROCESS_OK,
        "difficulties": row["difficulties"],
        "improvements": row["improvementconditions"],
    }


def _window(cycle, extra, today):
    # Process doc: the survey opens once the observation period ends, until the feedback deadline.
    opens_after = cycle["observationdeadline"]
    closes = extra["postobservationfeedbackdeadline"]
    if today <= opens_after:
        return "not_open_yet"
    if today > closes:
        return "closed"
    return "open"


def _roles_for(conn, professor_id, cycle_id):
    roles = {}
    observee = conn.execute(text(OBSERVEE_SIGNUP_SQL), {"cycle_id": cycle_id, "professor_id": professor_id}).scalar()
    if observee is not None:
        roles["Observee"] = observee
    observer = conn.execute(text(OBSERVER_SIGNUP_SQL), {"cycle_id": cycle_id, "professor_id": professor_id}).scalar()
    if observer is not None:
        roles["Observer"] = observer
    return roles


# What: which post-observation surveys a professor should take this cycle (AHC-297, AHC-298).
@router.get("/professors/{professor_id}/surveys")
def get_professor_surveys(
    professor_id: int,
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: professor_id, optional cycle_id
    # Output: one entry per role they had (observee and/or observer), whether it's open, and their answers
    today = campus_now().date()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        professor = conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).mappings().first()
        if professor is None:
            raise HTTPException(status_code=404, detail="Professor not found")
        extra = conn.execute(text(CYCLE_EXTRA_SQL), {"cycle_id": cycle["cycleid"]}).mappings().first()
        roles = _roles_for(conn, professor_id, cycle["cycleid"])
        existing = {
            r["role"]: r
            for r in conn.execute(text(EXISTING_SQL), {"cycle_id": cycle["cycleid"], "professor_id": professor_id}).mappings()
        }
    window = _window(cycle, extra, today)
    return {
        "professor_id": professor_id,
        "cycle_id": cycle["cycleid"],
        "window": window,
        "opens_after": cycle["observationdeadline"].isoformat(),
        "due": extra["postobservationfeedbackdeadline"].isoformat(),
        "committee_notified": extra["surveynotificationsentat"] is not None,
        "surveys": [
            {
                "role": role,
                "signup_id": roles[role],
                "submitted": role in existing,
                "response": _response_payload(existing[role]) if role in existing else None,
            }
            for role in ROLES
            if role in roles
        ],
    }


# What: an observee or observer submits the post-observation survey (AHC-297, AHC-298).
@router.post("/surveys", status_code=201)
def submit_survey(body: SurveyBody):
    # Input: professor_id, role, process_ok, difficulties, improvements, optional cycle_id
    # Output: the saved response
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="role must be Observee or Observer")
    now = campus_now().replace(microsecond=0)
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_SQL))
            cycle = resolve_cycle(conn, body.cycle_id)
            if conn.execute(text(PROFESSOR_SQL), {"professor_id": body.professor_id}).first() is None:
                raise HTTPException(status_code=404, detail="Professor not found")
            extra = conn.execute(text(CYCLE_EXTRA_SQL), {"cycle_id": cycle["cycleid"]}).mappings().first()
            window = _window(cycle, extra, now.date())
            if window == "not_open_yet":
                raise HTTPException(
                    status_code=400,
                    detail=f"The survey opens after the observation deadline ({cycle['observationdeadline']})",
                )
            if window == "closed":
                raise HTTPException(
                    status_code=400,
                    detail=f"The survey closed on {extra['postobservationfeedbackdeadline']}",
                )
            roles = _roles_for(conn, body.professor_id, cycle["cycleid"])
            if body.role not in roles:
                raise HTTPException(
                    status_code=400,
                    detail=f"You weren't an {body.role.lower()} this cycle",
                )
            existing = conn.execute(
                text(EXISTING_SQL), {"cycle_id": cycle["cycleid"], "professor_id": body.professor_id}
            ).mappings().all()
            if any(r["role"] == body.role for r in existing):
                raise HTTPException(status_code=409, detail=f"You already submitted the {body.role.lower()} survey")
            new_id = conn.execute(text(NEXT_ID_SQL)).scalar_one()
            conn.execute(
                text(INSERT_SQL),
                {
                    "id": new_id,
                    "cycle_id": cycle["cycleid"],
                    "professor_id": body.professor_id,
                    "signup_id": roles[body.role],
                    "role": body.role,
                    "d": now.date(),
                    "t": now.time(),
                    "process_status": PROCESS_OK if body.process_ok else PROCESS_NOT_OK,
                    "difficulties": body.difficulties,
                    "improvements": body.improvements,
                },
            )
            saved = next(
                r for r in conn.execute(
                    text(EXISTING_SQL), {"cycle_id": cycle["cycleid"], "professor_id": body.professor_id}
                ).mappings()
                if r["surveyresponseid"] == new_id
            )
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error(error))
    return {"professor_id": body.professor_id, "cycle_id": cycle["cycleid"], **_response_payload(saved)}


# What: survey responses for the committee.
@router.get("/surveys")
def list_survey_responses(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: every response plus who still owes a survey
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        extra = conn.execute(text(CYCLE_EXTRA_SQL), {"cycle_id": cycle["cycleid"]}).mappings().first()
        rows = conn.execute(text(RESPONSES_SQL), {"cycle_id": cycle["cycleid"]}).mappings().all()
        participants = conn.execute(text(PARTICIPANTS_SQL), {"cycle_id": cycle["cycleid"]}).mappings().all()
    done = {(r["professorid"], r["role"]) for r in rows}
    return {
        "cycle_id": cycle["cycleid"],
        "committee_notified_at": extra["surveynotificationsentat"].isoformat() if extra["surveynotificationsentat"] else None,
        "response_count": len(rows),
        "responses": [
            {"professor_id": r["professorid"], "professor_name": r["professorname"], "signup_id": r["signupid"], **_response_payload(r)}
            for r in rows
        ],
        "not_submitted": sorted(
            [{"professor_id": p["professorid"], "role": p["role"]} for p in participants if (p["professorid"], p["role"]) not in done],
            key=lambda item: (item["professor_id"], item["role"]),
        ),
    }


# What: committee notifies everyone to take the post-observation survey (AHC-299).
@router.post("/surveys/notify")
def notify_survey(cycle_id: int | None = Query(default=None, description="Defaults to the current cycle")):
    # Input: optional cycle_id
    # Output: when it was sent (400 before the observation deadline passes)
    now = campus_now().replace(microsecond=0)
    with engine.begin() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        if now.date() <= cycle["observationdeadline"]:
            raise HTTPException(
                status_code=400,
                detail=f"The survey notification can be sent after the observation deadline ({cycle['observationdeadline']})",
            )
        extra = conn.execute(text(CYCLE_EXTRA_SQL), {"cycle_id": cycle["cycleid"]}).mappings().first()
        if extra["surveynotificationsentat"] is not None:
            return {
                "cycle_id": cycle["cycleid"],
                "already_sent": True,
                "sent_at": extra["surveynotificationsentat"].isoformat(),
            }
        conn.execute(text(MARK_NOTIFIED_SQL), {"at": now, "cycle_id": cycle["cycleid"]})
    return {"cycle_id": cycle["cycleid"], "already_sent": False, "sent_at": now.isoformat()}
