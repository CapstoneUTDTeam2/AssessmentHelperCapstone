from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.api.cycle_deadlines import campus_now, require_before_deadline, resolve_cycle
from app.api.observee_signup import _check_preferred_dates
from app.db import engine

router = APIRouter(prefix="/api", tags=["observer-requests"])

# Request status. Accepted means the observer confirmed. When the observee picks one observer,
# the other confirmed observers get a graceful decline (Not Selected) and unanswered requests are Cancelled.
REQUEST_PENDING = "Pending"
REQUEST_ACCEPTED = "Accepted"
REQUEST_DECLINED = "Declined"
REQUEST_NOT_SELECTED = "Not Selected"
REQUEST_CANCELLED = "Cancelled"
REQUEST_EXPIRED = "Expired"

# Signup status after Phase 2's List Ready.
SIGNUP_LIST_READY = "List Ready"
SIGNUP_REQUESTS_SENT = "Requests Sent"
SIGNUP_ACCEPTED = "Accepted"

# Process doc: an observer can confirm 1, 2, or 3 observation requests.
MAX_CONFIRMATIONS_PER_CYCLE = 3
# An observer has 48 hours to answer a request.
REQUEST_EXPIRY_HOURS = 48

# The SQL selects every lowercase column name it needs explicitly.
SIGNUP_SQL = """
SELECT
    os.signupid, os.cycleid, os.observeeprofessorid, os.status,
    p.professorname,
    s.sectionid, s.sectionname, s.termid, s.meetingdays, s.starttime, s.endtime,
    c.coursecode, c.coursename,
    ec.templateid
FROM ObservationSignup os
JOIN Professors p ON os.ObserveeProfessorID = p.ProfessorID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
JOIN EvaluationCycle ec ON os.CycleID = ec.CycleID
WHERE os.SignupID = :signup_id
"""

REQUEST_COLUMNS = """
    r.requestid, r.signupid, r.observerprofessorid, r.status,
    r.requestdate, r.requesttime, r.expirationdate, r.expirationtime,
    obs.professorname AS observername,
    os.cycleid, os.observeeprofessorid,
    ee.professorname AS observeename,
    s.sectionid, s.sectionname, s.meetingdays, s.starttime, s.endtime,
    c.coursecode, c.coursename,
    ARRAY(
        SELECT spd.PreferredDate FROM SignupPreferredDate spd
        WHERE spd.SignupID = r.SignupID ORDER BY spd.PreferredDate
    ) AS proposeddates,
    (
        SELECT o.ObservationDate FROM Observation o
        WHERE o.SignupID = r.SignupID AND o.ObserverProfessorID = r.ObserverProfessorID
        ORDER BY o.ObservationID LIMIT 1
    ) AS observationdate
FROM ObserverRequest r
JOIN Professors obs ON r.ObserverProfessorID = obs.ProfessorID
JOIN ObservationSignup os ON r.SignupID = os.SignupID
JOIN Professors ee ON os.ObserveeProfessorID = ee.ProfessorID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
"""

REQUEST_BY_ID_SQL = f"SELECT {REQUEST_COLUMNS} WHERE r.RequestID = :request_id"
SIGNUP_REQUESTS_SQL = f"SELECT {REQUEST_COLUMNS} WHERE r.SignupID = :signup_id ORDER BY r.RequestID"
OBSERVER_REQUESTS_SQL = f"""
SELECT {REQUEST_COLUMNS}
WHERE r.ObserverProfessorID = :observer_id
  AND os.CycleID = :cycle_id
ORDER BY r.RequestDate DESC, r.RequestTime DESC, r.RequestID DESC
"""

PROFESSOR_SQL = "SELECT professorid, professorname FROM Professors WHERE professorid = :professor_id"
SAVED_LIST_SQL = "SELECT observerprofessorid FROM SignupObserverList WHERE SignupID = :signup_id"
PREFERRED_DATES_SQL = """
SELECT preferreddate FROM SignupPreferredDate WHERE SignupID = :signup_id ORDER BY preferreddate
"""
DELETE_PREFERRED_DATES_SQL = "DELETE FROM SignupPreferredDate WHERE SignupID = :signup_id"
INSERT_PREFERRED_DATE_SQL = "INSERT INTO SignupPreferredDate (SignupID, PreferredDate) VALUES (:signup_id, :d)"

# RequestID and ObservationID have no default in the DDL, so take the next number under a lock.
LOCK_REQUESTS_SQL = "LOCK TABLE ObserverRequest IN SHARE ROW EXCLUSIVE MODE"
LOCK_OBSERVATIONS_SQL = "LOCK TABLE Observation IN SHARE ROW EXCLUSIVE MODE"
NEXT_REQUEST_ID_SQL = "SELECT COALESCE(MAX(RequestID), 0) + 1 FROM ObserverRequest"
NEXT_OBSERVATION_ID_SQL = "SELECT COALESCE(MAX(ObservationID), 0) + 1 FROM Observation"

INSERT_REQUEST_SQL = """
INSERT INTO ObserverRequest (
    RequestID, SignupID, ObserverProfessorID, RequestDate, RequestTime,
    ExpirationDate, ExpirationTime, Status
)
VALUES (:request_id, :signup_id, :observer_id, :request_date, :request_time,
        :expiration_date, :expiration_time, 'Pending')
"""

SET_REQUEST_STATUS_SQL = "UPDATE ObserverRequest SET Status = :status WHERE RequestID = :request_id"
SET_SIGNUP_STATUS_SQL = "UPDATE ObservationSignup SET Status = :status WHERE SignupID = :signup_id"

OBSERVER_CONFIRMED_COUNT_SQL = """
SELECT COUNT(*)
FROM ObserverRequest r
JOIN ObservationSignup os ON r.SignupID = os.SignupID
WHERE r.ObserverProfessorID = :observer_id
  AND os.CycleID = :cycle_id
  AND r.Status = 'Accepted'
"""

SIGNUP_HAS_OBSERVATION_SQL = "SELECT 1 FROM Observation WHERE SignupID = :signup_id LIMIT 1"

INSERT_OBSERVATION_SQL = """
INSERT INTO Observation (
    ObservationID, SignupID, ObservationDate, ObserverProfessorID, TemplateID,
    ScheduledDate, ScheduledTime, Status, Signee, Observer, ObserveeID, ObservationTime
)
VALUES (
    :observation_id, :signup_id, :observation_date, :observer_id, :template_id,
    :observation_date, :start_time, 'Scheduled', :observee_name, :observer_name, :observee_id, :start_time
)
"""


class SendRequestsBody(BaseModel):
    signup_id: int
    observee_id: int
    observer_ids: list[int]
    proposed_dates: list[date] | None = None


class RespondBody(BaseModel):
    observer_id: int


class SelectObserverBody(BaseModel):
    observee_id: int
    observer_id: int
    observation_date: date | None = None


def _now():
    return campus_now().replace(microsecond=0)


def _time_str(value):
    return value.strftime("%H:%M") if value is not None and hasattr(value, "strftime") else value


def _expires_at(row):
    if row["expirationdate"] is None or row["expirationtime"] is None:
        return None
    return datetime.combine(row["expirationdate"], row["expirationtime"])


def _is_expired(row, now):
    expires = _expires_at(row)
    return row["status"] == REQUEST_PENDING and expires is not None and now > expires


def _request_payload(row, now):
    expires = _expires_at(row)
    status = REQUEST_EXPIRED if _is_expired(row, now) else row["status"]
    payload = {
        "request_id": row["requestid"],
        "signup_id": row["signupid"],
        "cycle_id": row["cycleid"],
        "status": status,
        "observer_id": row["observerprofessorid"],
        "observer_name": row["observername"],
        "observee_id": row["observeeprofessorid"],
        "observee_name": row["observeename"],
        "course_code": row["coursecode"],
        "course_name": row["coursename"],
        "section_id": row["sectionid"],
        "section_name": row["sectionname"],
        "meeting_days": row["meetingdays"],
        "start_time": _time_str(row["starttime"]),
        "end_time": _time_str(row["endtime"]),
        "proposed_dates": [d.isoformat() for d in (row["proposeddates"] or [])],
        "requested_at": (
            datetime.combine(row["requestdate"], row["requesttime"]).isoformat()
            if row["requestdate"] and row["requesttime"] else None
        ),
        "expires_at": expires.isoformat() if expires else None,
        "observation_date": row["observationdate"].isoformat() if row["observationdate"] else None,
    }
    if status == REQUEST_NOT_SELECTED:
        payload["message"] = (
            f"Thank you for confirming. {row['observeename']} chose another observer "
            f"for {row['coursecode']}.{row['sectionname']}, so you are not needed for this one."
        )
    elif status == REQUEST_CANCELLED:
        payload["message"] = (
            f"{row['observeename']} already chose an observer for "
            f"{row['coursecode']}.{row['sectionname']}, so this request was withdrawn."
        )
    return payload


def _db_error(error):
    original = getattr(error, "orig", None)
    return str(original if original is not None else error).splitlines()[0]


def _require_professor(conn, professor_id, label="Professor"):
    row = conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _require_signup(conn, signup_id):
    signup = conn.execute(text(SIGNUP_SQL), {"signup_id": signup_id}).mappings().first()
    if signup is None:
        raise HTTPException(status_code=404, detail="Signup not found")
    return signup


def _require_owner(signup, observee_id):
    if signup["observeeprofessorid"] != observee_id:
        raise HTTPException(status_code=403, detail="Only the observee who signed up can do this")


def _require_request(conn, request_id, observer_id):
    row = conn.execute(text(REQUEST_BY_ID_SQL), {"request_id": request_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if row["observerprofessorid"] != observer_id:
        raise HTTPException(status_code=403, detail="This request was sent to a different observer")
    return row


def _future_proposed_dates(conn, signup_id, today):
    dates = conn.execute(text(PREFERRED_DATES_SQL), {"signup_id": signup_id}).scalars().all()
    return [d for d in dates if d >= today]


# What: observee sends observation requests to all or some of their saved observers (AHC-261, AHC-262).
@router.post("/observer-requests", status_code=201)
def send_observer_requests(body: SendRequestsBody):
    # Input: signup_id, observee_id, observer_ids (from the saved list), optional proposed_dates
    # Output: the new Pending requests
    now = _now()
    today = now.date()
    observer_ids = list(dict.fromkeys(body.observer_ids))
    if not observer_ids:
        raise HTTPException(status_code=400, detail="Pick at least one observer")
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_REQUESTS_SQL))
            signup = _require_signup(conn, body.signup_id)
            _require_owner(signup, body.observee_id)
            if conn.execute(text(SIGNUP_HAS_OBSERVATION_SQL), {"signup_id": signup["signupid"]}).first():
                raise HTTPException(status_code=409, detail="An observer was already chosen for this signup")
            if signup["status"] not in (SIGNUP_LIST_READY, SIGNUP_REQUESTS_SENT):
                raise HTTPException(
                    status_code=400,
                    detail=f"Requests can be sent once the observer list is ready (signup is {signup['status']})",
                )
            cycle = resolve_cycle(conn, signup["cycleid"])
            require_before_deadline(cycle, "observation", today)

            saved = set(conn.execute(text(SAVED_LIST_SQL), {"signup_id": signup["signupid"]}).scalars().all())
            not_on_list = [o for o in observer_ids if o not in saved]
            if not_on_list:
                raise HTTPException(
                    status_code=400,
                    detail=f"Observer(s) {not_on_list} are not on this signup's observer list",
                )
            existing = conn.execute(text(SIGNUP_REQUESTS_SQL), {"signup_id": signup["signupid"]}).mappings().all()
            already = sorted(r["observerprofessorid"] for r in existing if r["observerprofessorid"] in observer_ids)
            if already:
                raise HTTPException(status_code=409, detail=f"Already sent a request to observer(s) {already}")

            # AHC-262: the dates on the request must be on class days, not in the past, and before the deadline.
            if body.proposed_dates is not None:
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail="Proposed dates were already sent with earlier requests and can't be changed now",
                    )
                dates = sorted(set(body.proposed_dates))
                _check_preferred_dates(dates, signup, cycle, today)
                conn.execute(text(DELETE_PREFERRED_DATES_SQL), {"signup_id": signup["signupid"]})
                for d in dates:
                    conn.execute(text(INSERT_PREFERRED_DATE_SQL), {"signup_id": signup["signupid"], "d": d})
            dates = _future_proposed_dates(conn, signup["signupid"], today)
            if not dates:
                raise HTTPException(status_code=400, detail="Add at least one proposed date that hasn't passed yet")
            late = [d for d in dates if d > cycle["observationdeadline"]]
            if late:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Proposed date {late[0]} is after the observation deadline "
                        f"{cycle['observationdeadline']}"
                    ),
                )

            expires = now + timedelta(hours=REQUEST_EXPIRY_HOURS)
            next_id = conn.execute(text(NEXT_REQUEST_ID_SQL)).scalar_one()
            created_ids = []
            for offset, observer_id in enumerate(observer_ids):
                conn.execute(
                    text(INSERT_REQUEST_SQL),
                    {
                        "request_id": next_id + offset,
                        "signup_id": signup["signupid"],
                        "observer_id": observer_id,
                        "request_date": today,
                        "request_time": now.time(),
                        "expiration_date": expires.date(),
                        "expiration_time": expires.time(),
                    },
                )
                created_ids.append(next_id + offset)
            conn.execute(
                text(SET_SIGNUP_STATUS_SQL),
                {"status": SIGNUP_REQUESTS_SENT, "signup_id": signup["signupid"]},
            )
            created = [
                conn.execute(text(REQUEST_BY_ID_SQL), {"request_id": rid}).mappings().first()
                for rid in created_ids
            ]
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error(error))
    return {"signup_id": body.signup_id, "requests": [_request_payload(r, now) for r in created]}


# What: the observee's requests for a signup and how each observer answered.
@router.get("/signups/{signup_id}/requests")
def list_signup_requests(signup_id: int):
    # Input: signup_id
    # Output: every request for the signup with its status
    now = _now()
    with engine.connect() as conn:
        signup = _require_signup(conn, signup_id)
        rows = conn.execute(text(SIGNUP_REQUESTS_SQL), {"signup_id": signup_id}).mappings().all()
    requests = [_request_payload(r, now) for r in rows]
    return {
        "signup_id": signup_id,
        "signup_status": signup["status"],
        "confirmed_count": sum(1 for r in requests if r["status"] == REQUEST_ACCEPTED),
        "requests": requests,
    }


# What: observer views the requests sent to them (AHC-263).
@router.get("/observer-requests")
def list_incoming_observer_requests(
    observer_id: int = Query(..., description="The observer"),
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: observer_id, optional cycle_id
    # Output: requests sent to that observer, with the observee's class and proposed dates
    now = _now()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        _require_professor(conn, observer_id, "Observer")
        rows = conn.execute(
            text(OBSERVER_REQUESTS_SQL), {"observer_id": observer_id, "cycle_id": cycle["cycleid"]}
        ).mappings().all()
        confirmed = conn.execute(
            text(OBSERVER_CONFIRMED_COUNT_SQL), {"observer_id": observer_id, "cycle_id": cycle["cycleid"]}
        ).scalar_one()
    requests = [_request_payload(r, now) for r in rows]
    return {
        "observer_id": observer_id,
        "cycle_id": cycle["cycleid"],
        "confirmed_count": confirmed,
        "max_confirmations": MAX_CONFIRMATIONS_PER_CYCLE,
        "pending_count": sum(1 for r in requests if r["status"] == REQUEST_PENDING),
        "requests": requests,
    }


# What: return all accepted confirmations to the observer (AHC-264).
@router.get("/observer-requests/accepted")
def list_accepted_confirmations(
    observer_id: int = Query(..., description="The observer"),
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: observer_id, optional cycle_id
    # Output: requests this observer confirmed, and whether the observee picked them
    now = _now()
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        _require_professor(conn, observer_id, "Observer")
        rows = conn.execute(
            text(OBSERVER_REQUESTS_SQL), {"observer_id": observer_id, "cycle_id": cycle["cycleid"]}
        ).mappings().all()
    accepted = []
    for row in rows:
        if row["status"] != REQUEST_ACCEPTED:
            continue
        payload = _request_payload(row, now)
        payload["selected"] = row["observationdate"] is not None
        accepted.append(payload)
    return {"observer_id": observer_id, "cycle_id": cycle["cycleid"], "accepted": accepted}


def _respond(request_id, observer_id, accept):
    now = _now()
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_REQUESTS_SQL))
            row = _require_request(conn, request_id, observer_id)
            if _is_expired(row, now):
                raise HTTPException(status_code=400, detail="This request expired")
            if row["status"] != REQUEST_PENDING:
                raise HTTPException(status_code=409, detail=f"This request is already {row['status']}")
            if conn.execute(text(SIGNUP_HAS_OBSERVATION_SQL), {"signup_id": row["signupid"]}).first():
                raise HTTPException(status_code=409, detail="The observee already chose an observer")
            if accept:
                cycle = resolve_cycle(conn, row["cycleid"])
                require_before_deadline(cycle, "observation", now.date())
                confirmed = conn.execute(
                    text(OBSERVER_CONFIRMED_COUNT_SQL),
                    {"observer_id": observer_id, "cycle_id": row["cycleid"]},
                ).scalar_one()
                if confirmed >= MAX_CONFIRMATIONS_PER_CYCLE:
                    raise HTTPException(
                        status_code=409,
                        detail=f"You already confirmed {MAX_CONFIRMATIONS_PER_CYCLE} requests this cycle",
                    )
            conn.execute(
                text(SET_REQUEST_STATUS_SQL),
                {"status": REQUEST_ACCEPTED if accept else REQUEST_DECLINED, "request_id": request_id},
            )
            updated = conn.execute(text(REQUEST_BY_ID_SQL), {"request_id": request_id}).mappings().first()
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error(error))
    return _request_payload(updated, now)


# What: observer confirms a request.
@router.post("/observer-requests/{request_id}/accept")
def accept_observer_request(request_id: int, body: RespondBody):
    # Input: request_id, observer_id
    # Output: the request, now Accepted
    return _respond(request_id, body.observer_id, accept=True)


# What: observer declines a request.
@router.post("/observer-requests/{request_id}/decline")
def decline_observer_request(request_id: int, body: RespondBody):
    # Input: request_id, observer_id
    # Output: the request, now Declined
    return _respond(request_id, body.observer_id, accept=False)


# What: observee chooses one confirmed observer (AHC-265), the others get graceful declines (AHC-266),
#       and the choice is stored as the scheduled observation (AHC-267).
@router.post("/signups/{signup_id}/select-observer", status_code=201)
def choose_observer(signup_id: int, body: SelectObserverBody):
    # Input: signup_id, observee_id, observer_id (must have confirmed), optional observation_date
    # Output: the scheduled observation, plus who got a graceful decline and which requests were withdrawn
    now = _now()
    today = now.date()
    try:
        with engine.begin() as conn:
            conn.execute(text(LOCK_REQUESTS_SQL))
            conn.execute(text(LOCK_OBSERVATIONS_SQL))
            signup = _require_signup(conn, signup_id)
            _require_owner(signup, body.observee_id)
            if conn.execute(text(SIGNUP_HAS_OBSERVATION_SQL), {"signup_id": signup_id}).first():
                raise HTTPException(status_code=409, detail="An observer was already chosen for this signup")
            if signup["status"] != SIGNUP_REQUESTS_SENT:
                raise HTTPException(
                    status_code=400,
                    detail=f"Send requests before choosing an observer (signup is {signup['status']})",
                )
            requests = conn.execute(text(SIGNUP_REQUESTS_SQL), {"signup_id": signup_id}).mappings().all()
            chosen = next((r for r in requests if r["observerprofessorid"] == body.observer_id), None)
            if chosen is None or chosen["status"] != REQUEST_ACCEPTED:
                raise HTTPException(status_code=400, detail="You can only choose an observer who confirmed your request")
            if signup["templateid"] is None:
                raise HTTPException(status_code=400, detail="This cycle has no observation template yet")
            cycle = resolve_cycle(conn, signup["cycleid"])
            require_before_deadline(cycle, "observation", today)

            proposed = _future_proposed_dates(conn, signup_id, today)
            observation_date = body.observation_date or (proposed[0] if proposed else None)
            if observation_date is None or observation_date not in proposed:
                raise HTTPException(
                    status_code=400,
                    detail="The observation date must be one of the proposed dates that hasn't passed",
                )

            observation_id = conn.execute(text(NEXT_OBSERVATION_ID_SQL)).scalar_one()
            conn.execute(
                text(INSERT_OBSERVATION_SQL),
                {
                    "observation_id": observation_id,
                    "signup_id": signup_id,
                    "observation_date": observation_date,
                    "observer_id": body.observer_id,
                    "template_id": signup["templateid"],
                    "start_time": signup["starttime"],
                    "observee_name": signup["professorname"],
                    "observer_name": chosen["observername"],
                    "observee_id": signup["observeeprofessorid"],
                },
            )
            not_selected, cancelled = [], []
            for request in requests:
                if request["requestid"] == chosen["requestid"]:
                    continue
                if request["status"] == REQUEST_ACCEPTED:
                    new_status = REQUEST_NOT_SELECTED
                    not_selected.append({"request_id": request["requestid"], "observer_name": request["observername"]})
                elif request["status"] == REQUEST_PENDING:
                    new_status = REQUEST_CANCELLED
                    cancelled.append({"request_id": request["requestid"], "observer_name": request["observername"]})
                else:
                    continue
                conn.execute(text(SET_REQUEST_STATUS_SQL), {"status": new_status, "request_id": request["requestid"]})
            conn.execute(text(SET_SIGNUP_STATUS_SQL), {"status": SIGNUP_ACCEPTED, "signup_id": signup_id})
    except DBAPIError as error:
        raise HTTPException(status_code=400, detail=_db_error(error))

    return {
        "observation_id": observation_id,
        "signup_id": signup_id,
        "observer_id": body.observer_id,
        "observer_name": chosen["observername"],
        "observee_id": signup["observeeprofessorid"],
        "observation_date": observation_date.isoformat(),
        "start_time": _time_str(signup["starttime"]),
        "status": "Scheduled",
        "graceful_declines": not_selected,
        "withdrawn_requests": cancelled,
    }
