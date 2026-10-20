import random

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from app.api.cycle_deadlines import campus_now, is_before_deadline, resolve_cycle
from app.api.observer_matching import MAX_MATCHES
from app.db import engine

router = APIRouter(prefix="/api", tags=["observer-selection"])

# Signup status as it moves through Phase 2.
# Pending -> Matched / Unmatched (selection run) -> List Ready (observee notified).
STATUS_PENDING = "Pending"
STATUS_MATCHED = "Matched"
STATUS_UNMATCHED = "Unmatched"
STATUS_LIST_READY = "List Ready"

# Only these signups get a new list. Later statuses, like List Ready or Accepted, keep theirs.
SELECTABLE_STATUSES = (STATUS_PENDING, STATUS_MATCHED, STATUS_UNMATCHED)
LIST_STATUSES = (STATUS_MATCHED, STATUS_UNMATCHED, STATUS_LIST_READY)

SIGNUP_COLUMNS = """
    os.signupid,
    os.observeeprofessorid,
    os.cycleid,
    os.status,
    p.professorname,
    s.sectionid,
    s.sectionname,
    c.coursecode,
    c.coursename
FROM ObservationSignup os
JOIN Professors p ON os.ObserveeProfessorID = p.ProfessorID
JOIN Sections s ON os.SectionID = s.SectionID
JOIN Courses c ON s.CourseID = c.CourseID
"""

CYCLE_SIGNUPS_SQL = f"""
SELECT {SIGNUP_COLUMNS}
WHERE os.CycleID = :cycle_id
ORDER BY os.signupid
"""

OBSERVEE_SIGNUPS_SQL = f"""
SELECT {SIGNUP_COLUMNS}
WHERE os.CycleID = :cycle_id
  AND os.ObserveeProfessorID = :professor_id
ORDER BY os.signupid
"""

SIGNUP_BY_ID_SQL = f"""
SELECT {SIGNUP_COLUMNS}
WHERE os.SignupID = :signup_id
"""

# Same rules the database uses to accept an ObserverRequest, so anyone listed can be requested.
ELIGIBLE_SQL = """
SELECT e.professorid, e.professorname, d.departmentname
FROM get_eligible_observers(:signup_id) e
JOIN Professors p ON p.ProfessorID = e.ProfessorID
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
ORDER BY e.professorname
"""

SAVED_LIST_SQL = """
SELECT p.professorid, p.professorname, d.departmentname, sol.saveddate
FROM SignupObserverList sol
JOIN Professors p ON sol.ObserverProfessorID = p.ProfessorID
JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
WHERE sol.SignupID = :signup_id
ORDER BY p.professorname
"""

DELETE_LIST_SQL = "DELETE FROM SignupObserverList WHERE SignupID = :signup_id"

INSERT_LIST_SQL = """
INSERT INTO SignupObserverList (SignupID, ObserverProfessorID, SavedDate)
VALUES (:signup_id, :observer_id, :saved_date)
"""

PROFESSOR_SQL = "SELECT professorid FROM Professors WHERE professorid = :professor_id"

UPDATE_STATUS_SQL = "UPDATE ObservationSignup SET Status = :status WHERE SignupID = :signup_id"


def _today():
    return campus_now().date()


def _observer(row):
    return {
        "observer_id": row["professorid"],
        "name": row["professorname"],
        "department": row["departmentname"],
    }


def eligible_observers(conn, signup_id):
    rows = conn.execute(text(ELIGIBLE_SQL), {"signup_id": signup_id}).mappings().all()
    return [_observer(row) for row in rows]


def saved_observers(conn, signup_id):
    rows = conn.execute(text(SAVED_LIST_SQL), {"signup_id": signup_id}).mappings().all()
    return [_observer(row) for row in rows]


def has_saved_list(status):
    return status in LIST_STATUSES


def _pick(eligible):
    # Up to five names; random when more qualify. Picked once, then saved.
    if len(eligible) <= MAX_MATCHES:
        return eligible
    return sorted(random.sample(eligible, MAX_MATCHES), key=lambda item: item["name"])


def _alert_for(signup, eligible_count):
    # AHC-246: none found is the alert from the process doc; fewer than five is a warning.
    who = f"{signup['professorname']}'s {signup['coursecode']}.{signup['sectionname']}"
    if eligible_count == 0:
        level = "none"
        message = f"No eligible observers found for {who}"
    elif eligible_count < MAX_MATCHES:
        level = "low"
        message = f"Only {eligible_count} eligible observer(s) for {who}, fewer than {MAX_MATCHES}"
    else:
        return None
    return {
        "signup_id": signup["signupid"],
        "professor_id": signup["observeeprofessorid"],
        "professor_name": signup["professorname"],
        "course_code": signup["coursecode"],
        "section_id": signup["sectionid"],
        "eligible_count": eligible_count,
        "level": level,
        "message": message,
    }


def _signup_summary(signup, status, observers, eligible_count=None):
    summary = {
        "signup_id": signup["signupid"],
        "professor_id": signup["observeeprofessorid"],
        "professor_name": signup["professorname"],
        "course_code": signup["coursecode"],
        "course_name": signup["coursename"],
        "section_id": signup["sectionid"],
        "section_name": signup["sectionname"],
        "status": status,
        "observers": observers,
    }
    if eligible_count is not None:
        summary["eligible_count"] = eligible_count
    return summary


def _cycle_info(cycle):
    return {"cycle_id": cycle["cycleid"], "semester": cycle["semester"], "year": cycle["yearnum"]}


def _cycle_signups(conn, cycle):
    return conn.execute(text(CYCLE_SIGNUPS_SQL), {"cycle_id": cycle["cycleid"]}).mappings().all()


# What: committee starts observer selection for the cycle (AHC-247).
@router.post("/observer-selection/start")
def start_observer_selection(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: optional cycle_id
    # Output: each signup's saved observer list, its new status, and any alerts
    today = _today()
    with engine.begin() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        if is_before_deadline(cycle, "signup", today):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Observer selection can start after the signup deadline "
                    f"({cycle['signupdeadline'].isoformat()})"
                ),
            )

        results, alerts = [], []
        for signup in _cycle_signups(conn, cycle):
            status = signup["status"]
            if status not in SELECTABLE_STATUSES:
                saved = saved_observers(conn, signup["signupid"])
                results.append(_signup_summary(signup, status, saved))
                continue

            eligible = eligible_observers(conn, signup["signupid"])
            observers = _pick(eligible)
            conn.execute(text(DELETE_LIST_SQL), {"signup_id": signup["signupid"]})
            for observer in observers:
                conn.execute(
                    text(INSERT_LIST_SQL),
                    {
                        "signup_id": signup["signupid"],
                        "observer_id": observer["observer_id"],
                        "saved_date": today,
                    },
                )
            status = STATUS_MATCHED if observers else STATUS_UNMATCHED
            conn.execute(text(UPDATE_STATUS_SQL), {"status": status, "signup_id": signup["signupid"]})
            results.append(_signup_summary(signup, status, observers, len(eligible)))
            alert = _alert_for(signup, len(eligible))
            if alert:
                alerts.append(alert)

    return {
        **_cycle_info(cycle),
        "started_on": today.isoformat(),
        "signup_count": len(results),
        "matched_count": sum(1 for r in results if r["status"] == STATUS_MATCHED),
        "unmatched_count": sum(1 for r in results if r["status"] == STATUS_UNMATCHED),
        "alert_count": len(alerts),
        "signups": results,
        "alerts": alerts,
    }


# What: alerts for signups without enough eligible observers (AHC-246).
@router.get("/observer-selection/alerts")
def list_observer_alerts(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: optional cycle_id
    # Output: signups with no eligible observers (level none) or fewer than five (level low)
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        alerts = []
        for signup in _cycle_signups(conn, cycle):
            if signup["status"] not in SELECTABLE_STATUSES + (STATUS_LIST_READY,):
                continue
            alert = _alert_for(signup, len(eligible_observers(conn, signup["signupid"])))
            if alert:
                alerts.append(alert)
    return {
        **_cycle_info(cycle),
        "alert_count": len(alerts),
        "no_match_count": sum(1 for a in alerts if a["level"] == "none"),
        "alerts": alerts,
    }


# What: a signup's saved observer list.
@router.get("/signups/{signup_id}/observer-list")
def get_signup_observer_list(signup_id: int):
    # Input: signup_id
    # Output: the saved list, empty until observer selection has run
    with engine.connect() as conn:
        signup = conn.execute(text(SIGNUP_BY_ID_SQL), {"signup_id": signup_id}).mappings().first()
        if signup is None:
            raise HTTPException(status_code=404, detail="Signup not found")
        observers = saved_observers(conn, signup_id)
    return {
        **_signup_summary(signup, signup["status"], observers),
        "list_saved": has_saved_list(signup["status"]),
    }


# What: committee notifies observees that their observer list is ready (AHC-248).
@router.post("/observer-selection/notify")
def notify_observees(
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
    signup_id: int | None = Query(default=None, description="Notify one signup only"),
):
    # Input: optional cycle_id, optional signup_id
    # Output: signups marked List Ready, and signups skipped because they have no list
    with engine.begin() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        signups = _cycle_signups(conn, cycle)
        if signup_id is not None:
            signups = [s for s in signups if s["signupid"] == signup_id]
            if not signups:
                raise HTTPException(status_code=404, detail="Signup not found in this cycle")

        notified, skipped = [], []
        for signup in signups:
            if signup["status"] == STATUS_MATCHED:
                conn.execute(
                    text(UPDATE_STATUS_SQL),
                    {"status": STATUS_LIST_READY, "signup_id": signup["signupid"]},
                )
                notified.append({"signup_id": signup["signupid"], "professor_name": signup["professorname"]})
            elif signup["status"] in (STATUS_PENDING, STATUS_UNMATCHED):
                skipped.append(
                    {
                        "signup_id": signup["signupid"],
                        "professor_name": signup["professorname"],
                        "status": signup["status"],
                        "reason": (
                            "Observer selection has not run yet"
                            if signup["status"] == STATUS_PENDING
                            else "No eligible observers were found"
                        ),
                    }
                )

    return {
        **_cycle_info(cycle),
        "notified_count": len(notified),
        "notified": notified,
        "skipped": skipped,
    }


# What: an observee's notifications, like their observer list being ready (AHC-248).
@router.get("/observees/{professor_id}/notifications")
def get_observee_notifications(
    professor_id: int,
    cycle_id: int | None = Query(default=None, description="Defaults to the current cycle"),
):
    # Input: professor_id, optional cycle_id
    # Output: list of notifications (empty if none)
    with engine.connect() as conn:
        cycle = resolve_cycle(conn, cycle_id)
        if conn.execute(text(PROFESSOR_SQL), {"professor_id": professor_id}).first() is None:
            raise HTTPException(status_code=404, detail="Professor not found")
        signups = conn.execute(
            text(OBSERVEE_SIGNUPS_SQL),
            {"cycle_id": cycle["cycleid"], "professor_id": professor_id},
        ).mappings().all()
        notifications = [
            {
                "type": "observer_list_ready",
                "signup_id": signup["signupid"],
                "course_code": signup["coursecode"],
                "section_name": signup["sectionname"],
                "message": (
                    f"Your list of possible observers for {signup['coursecode']}."
                    f"{signup['sectionname']} is ready. Choose who to send requests to."
                ),
                "observers": saved_observers(conn, signup["signupid"]),
            }
            for signup in signups
            if signup["status"] == STATUS_LIST_READY
        ]
    return {**_cycle_info(cycle), "professor_id": professor_id, "notifications": notifications}
