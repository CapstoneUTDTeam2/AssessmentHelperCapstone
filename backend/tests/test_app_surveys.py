"""App improvement survey: only for observations signed by both, until the app feedback deadline."""

from datetime import timedelta

import psycopg

from app.api import cycle_deadlines
from tests.conftest import TEST_DATABASE_URL, _raw_conninfo

# Sample data: observation 1 is Alice (1) observed by Robert (2), Completed.
# Observation 3 is Carol (3) observed by Alice (1), still Scheduled.


def _submit(client, professor_id, observation_id, **extra):
    body = {"professor_id": professor_id, "observation_id": observation_id, **extra}
    return client.post("/api/app-surveys", json=body)


def test_lists_only_signed_observations(client):
    body = client.get("/api/professors/1/app-surveys").json()
    assert body["window"] == "open"
    ids = {(s["observation_id"], s["role"]) for s in body["surveys"]}
    assert (1, "Observee") in ids
    # Observation 3 isn't signed yet, so it has no app survey.
    assert all(s["observation_id"] != 3 for s in body["surveys"])


def test_observee_and_observer_each_submit_once(client):
    first = _submit(client, 1, 1, improvements="Email reminders.", enjoyments="Easy signup.")
    assert first.status_code == 201
    assert first.json()["role"] == "Observee"
    assert _submit(client, 1, 1).status_code == 409

    observer = _submit(client, 2, 1, enjoyments="Clear form.")
    assert observer.status_code == 201
    assert observer.json()["role"] == "Observer"

    mine = client.get("/api/professors/1/app-surveys").json()["surveys"]
    entry = next(s for s in mine if s["observation_id"] == 1)
    assert entry["submitted"] is True
    assert entry["response"]["improvements"] == "Email reminders."


def test_no_survey_for_unsigned_or_not_held_report(client):
    response = _submit(client, 1, 3)
    assert response.status_code == 400
    assert "signed the report" in response.json()["detail"]

    with psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True) as conn:
        conn.execute("UPDATE Observation SET Status = 'Not Held', NotHeldReason = 'Sick' WHERE ObservationID = 3")
    assert _submit(client, 3, 3).status_code == 400
    assert all(s["observation_id"] != 3 for s in client.get("/api/professors/3/app-surveys").json()["surveys"])


def test_only_people_in_the_observation(client):
    response = _submit(client, 4, 1)
    assert response.status_code == 400
    assert "weren't part" in response.json()["detail"]


def test_closed_after_app_feedback_deadline(client):
    today = cycle_deadlines.campus_now().date()
    client.put(
        "/api/evaluation-cycles/2/deadlines",
        json={
            "signup": str(today - timedelta(days=30)),
            "observation": str(today - timedelta(days=5)),
            "post_observation_feedback": str(today - timedelta(days=1)),
            "app_feedback": str(today - timedelta(days=1)),
        },
    )
    assert client.get("/api/professors/1/app-surveys").json()["window"] == "closed"
    response = _submit(client, 1, 1)
    assert response.status_code == 400
    assert "closed" in response.json()["detail"]


def test_committee_sees_responses_and_who_is_missing(client):
    _submit(client, 1, 1, improvements="Email reminders.")
    body = client.get("/api/app-surveys").json()
    assert body["response_count"] == 1
    assert body["responses"][0]["professor_name"] and body["responses"][0]["role"] == "Observee"
    missing = {(m["observation_id"], m["role"]) for m in body["not_submitted"]}
    assert (1, "Observer") in missing
    assert (1, "Observee") not in missing
