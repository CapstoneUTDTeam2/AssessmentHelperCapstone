"""AHC-297 observee survey, AHC-298 observer survey, AHC-299 committee survey notification."""

from datetime import timedelta

import pytest

from app.api import cycle_deadlines


def _today():
    return cycle_deadlines.campus_now().date()


def _set_deadlines(client, observation_offset, feedback_offset):
    today = _today()
    response = client.put(
        "/api/evaluation-cycles/2/deadlines",
        json={
            "signup": str(today - timedelta(days=30)),
            "observation": str(today + timedelta(days=observation_offset)),
            "post_observation_feedback": str(today + timedelta(days=feedback_offset)),
            "app_feedback": str(today + timedelta(days=feedback_offset)),
        },
    )
    assert response.status_code == 200


@pytest.fixture
def survey_open(client):
    # Observation period ended yesterday; feedback is due in 10 days.
    _set_deadlines(client, -1, 10)


def _submit(client, professor_id, role, **extra):
    body = {"professor_id": professor_id, "role": role, "process_ok": True, **extra}
    return client.post("/api/surveys", json=body)


# Sample data already has surveys: Alice (1) and Robert (2) as observees, Carol (3) and David (4) as observers.


def test_survey_not_open_before_observation_deadline(client):
    response = _submit(client, 3, "Observee")
    assert response.status_code == 400
    assert "opens after the observation deadline" in response.json()["detail"]


def test_survey_closed_after_feedback_deadline(client):
    _set_deadlines(client, -5, -1)
    response = _submit(client, 3, "Observee")
    assert response.status_code == 400
    assert "closed" in response.json()["detail"]


def test_observee_submits_survey(client, survey_open):
    response = _submit(
        client, 3, "Observee", process_ok=False, difficulties="Hard to find a date.", improvements="More observers."
    )
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "Observee"
    assert body["process_ok"] is False
    assert body["difficulties"] == "Hard to find a date."
    assert body["improvements"] == "More observers."
    assert body["submitted_at"].startswith(_today().isoformat())
    assert _submit(client, 3, "Observee").status_code == 409


def test_observer_submits_survey(client, survey_open):
    # Alice observes Carol (observation 3) and hasn't taken the observer survey yet.
    response = _submit(client, 1, "Observer")
    assert response.status_code == 201
    assert response.json()["role"] == "Observer"


def test_already_submitted_in_sample_data(client, survey_open):
    assert _submit(client, 1, "Observee").status_code == 409
    assert _submit(client, 3, "Observer").status_code == 409


def test_must_have_that_role(client, survey_open):
    response = _submit(client, 5, "Observee")
    assert response.status_code == 400
    assert "weren't an observee" in response.json()["detail"]
    assert _submit(client, 4, "Observee").status_code == 201  # David is an observee


def test_bad_role_and_unknown_professor(client, survey_open):
    assert _submit(client, 3, "Committee").status_code == 400
    assert _submit(client, 999, "Observee").status_code == 404


def test_professor_survey_status(client, survey_open):
    body = client.get("/api/professors/1/surveys").json()
    assert body["window"] == "open"
    assert body["committee_notified"] is False
    surveys = {s["role"]: s for s in body["surveys"]}
    assert surveys["Observee"]["submitted"] is True
    assert surveys["Observee"]["response"]["process_ok"] is False  # sample ProcessStatus isn't "Satisfied"
    assert surveys["Observer"]["submitted"] is False
    assert client.get("/api/professors/5/surveys").json()["surveys"] == []
    assert client.get("/api/professors/999/surveys").status_code == 404


def test_survey_status_before_open(client):
    assert client.get("/api/professors/3/surveys").json()["window"] == "not_open_yet"


def test_notify_only_after_observation_deadline(client):
    response = client.post("/api/surveys/notify")
    assert response.status_code == 400
    assert "after the observation deadline" in response.json()["detail"]


def test_notify_and_observees_see_it(client, survey_open):
    first = client.post("/api/surveys/notify").json()
    assert first["already_sent"] is False
    second = client.post("/api/surveys/notify").json()
    assert second["already_sent"] is True and second["sent_at"] == first["sent_at"]

    # David (4) hasn't taken the observee survey, so he sees the notice. Alice (1) already did.
    david = client.get("/api/observees/4/notifications").json()["notifications"]
    assert [n["type"] for n in david] == ["survey_open"]
    # Same fields the frontend's ObserveeNotification type expects.
    assert {"signup_id", "status", "message", "observers"} <= set(david[0])
    alice = client.get("/api/observees/1/notifications").json()["notifications"]
    assert alice == []
    # Emily (5) has no signup, so nothing.
    assert client.get("/api/observees/5/notifications").json()["notifications"] == []

    _submit(client, 4, "Observee")
    assert client.get("/api/observees/4/notifications").json()["notifications"] == []
    assert client.get("/api/professors/4/surveys").json()["committee_notified"] is True


def test_committee_sees_responses(client, survey_open):
    _submit(client, 3, "Observee")
    body = client.get("/api/surveys").json()
    assert body["response_count"] == 5
    not_submitted = {(p["professor_id"], p["role"]) for p in body["not_submitted"]}
    assert (4, "Observee") in not_submitted
    assert (1, "Observer") in not_submitted
    assert (3, "Observee") not in not_submitted
