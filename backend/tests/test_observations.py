"""AHC-281 completed observation tracking, the observation form, and AHC-283 both signatures + lock."""

from datetime import timedelta

import psycopg
import pytest

from app.api import cycle_deadlines
from tests.conftest import TEST_DATABASE_URL, _raw_conninfo


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def _today():
    return cycle_deadlines.campus_now().date()


# Sample data: observation 3 is Carol (3) observed by Alice (1), Scheduled, template 2 with criteria 4, 5, 6.
# Observations 1 and 2 are Completed.

@pytest.fixture
def happened(client):
    """Move observation 3 to yesterday so it can be signed."""
    with _db() as conn:
        conn.execute(
            "UPDATE Observation SET ScheduledDate = %s, ObservationDate = %s WHERE ObservationID = 3",
            (_today() - timedelta(days=1), _today() - timedelta(days=1)),
        )


def _rate(client, ratings, observer_id=1, summary=None, observation_id=3):
    body = {"observer_id": observer_id, "ratings": ratings}
    if summary is not None:
        body["summary"] = summary
    return client.put(f"/api/observations/{observation_id}/ratings", json=body)


FULL = [
    {"criterion_id": 4, "rating": 5, "comment": "Clear plan."},
    {"criterion_id": 5, "rating": 4},
    {"criterion_id": 6, "rating": 6},
]


def test_list_observations(client):
    body = client.get("/api/observations").json()
    assert body["completed_count"] == 2
    ids = [o["observation_id"] for o in body["observations"]]
    assert set(ids) == {1, 2, 3, 4}
    completed = client.get("/api/observations", params={"status": "Completed"}).json()["observations"]
    assert {o["observation_id"] for o in completed} == {1, 2}
    assert all(o["locked"] for o in completed)


def test_get_completed_observation(client):
    body = client.get("/api/observations/1").json()
    assert body["observee_name"] == "Alice Johnson"
    assert body["observer_name"] == "Robert Smith"
    assert body["course_code"] == "CS 1337"
    assert body["semester"] == "Fall" and body["year"] == 2026
    assert body["locked"] is True
    ratings = {c["criterion_id"]: c["rating"] for c in body["criteria"]}
    assert ratings == {4: 5, 5: 4, 6: 6}
    assert next(c for c in body["criteria"] if c["criterion_id"] == 6)["not_applicable"] is True


def test_unknown_observation(client):
    assert client.get("/api/observations/999").status_code == 404


def test_professor_observations(client):
    alice = client.get("/api/professors/1/observations").json()
    assert [o["observation_id"] for o in alice["received"]] == [1]
    assert [o["observation_id"] for o in alice["given"]] == [3]
    assert alice["given"][0]["needs_my_signature"] is True
    assert alice["received"][0]["needs_my_signature"] is False
    assert client.get("/api/professors/999/observations").status_code == 404


def test_observer_saves_ratings_and_summary(client):
    response = _rate(client, FULL[:2], summary="Good class overall.")
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == "Good class overall."
    assert {c["criterion_id"]: c["rating"] for c in body["criteria"]} == {4: 5, 5: 4, 6: None}
    assert body["ready_to_sign"] is False
    assert body["missing"] == ["Student Interaction needs a rating"]

    # Saving again updates instead of duplicating.
    again = _rate(client, [{"criterion_id": 4, "rating": 3}]).json()
    assert next(c for c in again["criteria"] if c["criterion_id"] == 4)["rating"] == 3


def test_only_observer_can_rate(client):
    assert _rate(client, FULL, observer_id=3).status_code == 403


@pytest.mark.parametrize(
    "ratings, message",
    [
        ([{"criterion_id": 4, "rating": 0}], "1 to 5"),
        ([{"criterion_id": 4, "rating": 7}], "1 to 5"),
        ([{"criterion_id": 1, "rating": 3}], "isn't on this observation's form"),
        ([{"criterion_id": 4, "rating": 3}, {"criterion_id": 4, "rating": 4}], "only be rated once"),
    ],
)
def test_bad_ratings(client, ratings, message):
    response = _rate(client, ratings)
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_completed_observation_cannot_be_rated(client):
    response = _rate(client, [{"criterion_id": 4, "rating": 1}], observer_id=2, observation_id=1)
    assert response.status_code == 409
    assert "locked" in response.json()["detail"]


def test_sign_requires_finished_form(client, happened):
    _rate(client, FULL[:2])
    response = client.post("/api/observations/3/sign", json={"professor_id": 1})
    assert response.status_code == 400
    assert "Student Interaction needs a rating" in response.json()["detail"]


def test_low_rating_needs_comment(client, happened):
    _rate(client, [{"criterion_id": 4, "rating": 2}, FULL[1], FULL[2]])
    response = client.post("/api/observations/3/sign", json={"professor_id": 1})
    assert response.status_code == 400
    assert "rated 2, so it needs a comment" in response.json()["detail"]


def test_cannot_sign_before_it_happens(client):
    _rate(client, FULL)
    with _db() as conn:
        conn.execute(
            "UPDATE Observation SET ScheduledDate = %s, ObservationDate = %s WHERE ObservationID = 3",
            (_today() + timedelta(days=3), _today() + timedelta(days=3)),
        )
    response = client.post("/api/observations/3/sign", json={"professor_id": 1})
    assert response.status_code == 400
    assert "has happened" in response.json()["detail"]


def test_both_sign_then_locked(client, happened):
    _rate(client, FULL, summary="Strong session.")
    first = client.post("/api/observations/3/sign", json={"professor_id": 1})
    assert first.status_code == 200
    body = first.json()
    assert body["observer_signed"] is True and body["observee_signed"] is False
    assert body["status"] == "Scheduled" and body["locked"] is False

    # After one signature the form can't change.
    assert _rate(client, [{"criterion_id": 4, "rating": 1, "comment": "x"}]).status_code == 409
    assert client.post("/api/observations/3/sign", json={"professor_id": 1}).status_code == 409

    second = client.post("/api/observations/3/sign", json={"professor_id": 3})
    assert second.status_code == 200
    done = second.json()
    assert done["observee_signed"] is True
    assert done["status"] == "Completed" and done["locked"] is True
    assert done["completed_at"].startswith(_today().isoformat())

    assert client.post("/api/observations/3/sign", json={"professor_id": 3}).status_code == 409
    # The database also refuses any change now.
    with _db() as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("UPDATE Observation SET Notes = 'changed' WHERE ObservationID = 3")


def test_observee_can_sign_first(client, happened):
    _rate(client, FULL)
    assert client.post("/api/observations/3/sign", json={"professor_id": 3}).json()["observee_signed"] is True
    assert client.post("/api/observations/3/sign", json={"professor_id": 1}).json()["status"] == "Completed"


def test_only_the_two_people_can_sign(client, happened):
    _rate(client, FULL)
    assert client.post("/api/observations/3/sign", json={"professor_id": 2}).status_code == 403


def test_completing_counts_as_last_evaluation(client, happened):
    _rate(client, FULL)
    client.post("/api/observations/3/sign", json={"professor_id": 1})
    client.post("/api/observations/3/sign", json={"professor_id": 3})
    status = client.get("/api/evaluation-status/3").json()
    assert status["last_evaluation_date"] == _today().isoformat()
