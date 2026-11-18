from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.api.cycle_deadlines import campus_now, resolve_cycle
from app.db import engine

router = APIRouter(prefix="/api", tags=["evaluation-policy"])

# Changes never touch a cycle that has started. A cycle has started once anyone
# signed up for it or its signup deadline passed; then changes go to the next cycle.

POLICY_SQL = """
SELECT sourcecycleid, assistantfrequencyyears, seniorfrequencyyears, signupspercycle, maxobservers
FROM evaluation_policy(:cycle_id)
"""

HAS_SIGNUPS_SQL = "SELECT 1 FROM ObservationSignup WHERE CycleID = :cycle_id LIMIT 1"

NEXT_CYCLE_SQL = """
SELECT ec.CycleID
FROM EvaluationCycle ec
JOIN AcademicTerm at ON at.TermID = ec.TermID
CROSS JOIN (
    SELECT at2.YearNum * 10 + CASE at2.Semester WHEN 'Spring' THEN 1 WHEN 'Summer' THEN 2 ELSE 3 END AS term_key
    FROM EvaluationCycle ec2
    JOIN AcademicTerm at2 ON at2.TermID = ec2.TermID
    WHERE ec2.CycleID = :cycle_id
) cur
WHERE at.Semester IN ('Spring', 'Fall')
  AND at.YearNum * 10 + CASE at.Semester WHEN 'Spring' THEN 1 ELSE 3 END > cur.term_key
ORDER BY at.YearNum, CASE at.Semester WHEN 'Spring' THEN 1 ELSE 3 END
LIMIT 1
"""

UPSERT_SQL = """
INSERT INTO EvaluationPolicy (
    CycleID, AssistantFrequencyYears, SeniorFrequencyYears, SignupsPerCycle, MaxObservers, UpdatedAt
)
VALUES (:cycle_id, :assistant, :senior, :signups, :observers, CURRENT_TIMESTAMP)
ON CONFLICT (CycleID) DO UPDATE SET
    AssistantFrequencyYears = EXCLUDED.AssistantFrequencyYears,
    SeniorFrequencyYears = EXCLUDED.SeniorFrequencyYears,
    SignupsPerCycle = EXCLUDED.SignupsPerCycle,
    MaxObservers = EXCLUDED.MaxObservers,
    UpdatedAt = CURRENT_TIMESTAMP
"""


class PolicyUpdate(BaseModel):
    assistant_frequency_years: int = Field(ge=1, le=5)
    senior_frequency_years: int = Field(ge=1, le=5)
    signups_per_cycle: int = Field(ge=1, le=5)
    max_observers: int = Field(ge=1, le=10)


def get_policy(conn, cycle_id):
    # Input: cycle id. Output: the rules in effect for that cycle.
    row = conn.execute(text(POLICY_SQL), {"cycle_id": cycle_id}).mappings().first()
    return {
        "assistant_frequency_years": row["assistantfrequencyyears"],
        "senior_frequency_years": row["seniorfrequencyyears"],
        "signups_per_cycle": row["signupspercycle"],
        "max_observers": row["maxobservers"],
        "is_default": row["sourcecycleid"] is None,
    }


def max_observers(conn, cycle_id):
    return get_policy(conn, cycle_id)["max_observers"]


def signups_per_cycle(conn, cycle_id):
    return get_policy(conn, cycle_id)["signups_per_cycle"]


def _cycle_label(cycle):
    return {"cycle_id": cycle["cycleid"], "semester": cycle["semester"], "year": cycle["yearnum"]}


def _started(conn, cycle, today):
    if today > cycle["signupdeadline"]:
        return True
    return conn.execute(text(HAS_SIGNUPS_SQL), {"cycle_id": cycle["cycleid"]}).first() is not None


def _editable_cycle(conn, current, today):
    # The current cycle until it starts, then the next one (None if no next cycle exists).
    if not _started(conn, current, today):
        return current
    next_id = conn.execute(text(NEXT_CYCLE_SQL), {"cycle_id": current["cycleid"]}).scalar()
    return resolve_cycle(conn, next_id) if next_id is not None else None


def _payload(conn):
    today = campus_now().date()
    current = resolve_cycle(conn)
    editable = _editable_cycle(conn, current, today)
    current_started = editable is None or editable["cycleid"] != current["cycleid"]
    return {
        "current": {**_cycle_label(current), "started": current_started, "policy": get_policy(conn, current["cycleid"])},
        "editable": (
            {**_cycle_label(editable), "policy": get_policy(conn, editable["cycleid"])}
            if editable is not None
            else None
        ),
    }


# What: the evaluation policy in effect now, and the cycle a change would apply to.
@router.get("/evaluation-policy")
def read_evaluation_policy():
    # Input: none
    # Output: current cycle's policy, whether it started, and the editable cycle's policy
    with engine.connect() as conn:
        return _payload(conn)


# What: committee changes the evaluation policy for the next cycle that hasn't started.
@router.put("/evaluation-policy")
def update_evaluation_policy(update: PolicyUpdate):
    # Input: assistant/senior frequency years (1-5), signups per cycle (1-5), max observers (1-10)
    # Output: same as GET, after saving
    today = campus_now().date()
    with engine.begin() as conn:
        editable = _editable_cycle(conn, resolve_cycle(conn), today)
        if editable is None:
            raise HTTPException(
                status_code=400,
                detail="The current cycle has started and there is no next cycle to change yet",
            )
        conn.execute(
            text(UPSERT_SQL),
            {
                "cycle_id": editable["cycleid"],
                "assistant": update.assistant_frequency_years,
                "senior": update.senior_frequency_years,
                "signups": update.signups_per_cycle,
                "observers": update.max_observers,
            },
        )
        return _payload(conn)
