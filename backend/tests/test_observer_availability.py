"""Observer weekly availability, and matching using the database's eligibility rule."""

from datetime import timedelta

import psycopg
import pytest

from app.api import cycle_deadlines, observer_availability
from tests.conftest import TEST_DATABASE_URL, _raw_conninfo


def _campus_today():
    return cycle_deadlines.campus_now().date()


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def _eligible_ids(client, signup_id):
    response = client.get(f"/api/signups/{signup_id}/eligible-observers")
    assert response.status_code == 200
    return [o["observer_id"] for o in response.json()["observers"]]


def _db_eligible_ids(signup_id):
    with _db() as conn:
        rows = conn.execute(
            "SELECT ProfessorID FROM get_eligible_observers(%s) ORDER BY ProfessorName", (signup_id,)
        ).fetchall()
    return [row[0] for row in rows]


# Availability endpoints

def test_get_availability(client):
    body = client.get("/api/observers/1/availability").json()
    assert body["cycle_id"] == 2
    assert body["enrollment_status"] == "Active"
    assert body["weekly"] == [
        {"weekday": "M", "weekday_name": "Monday", "start_time": "12:00", "end_time": "17:00"},
        {"weekday": "W", "weekday_name": "Wednesday", "start_time": "12:00", "end_time": "17:00"},
    ]
    assert body["unavailable_dates"] == []


def test_get_availability_none_yet(client):
    body = client.get("/api/observers/5/availability").json()
    assert body["weekly"] == []
    assert body["enrollment_status"] is None


def test_set_availability_saves_and_enrolls(client):
    day_off = _campus_today() + timedelta(days=10)
    response = client.put(
        "/api/observers/5/availability",
        json={
            "weekly": [
                {"weekday": "r", "start_time": "09:00", "end_time": "12:00"},
                {"weekday": "T", "start_time": "08:00", "end_time": "17:00"},
            ],
            "unavailable_dates": [str(day_off), str(day_off)],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert [slot["weekday"] for slot in body["weekly"]] == ["T", "R"]
    assert body["unavailable_dates"] == [str(day_off)]
    assert body["enrollment_status"] == "Active"
    assert client.get("/api/observers/5/availability").json() == body


def test_set_availability_replaces_old_slots(client):
    response = client.put(
        "/api/observers/1/availability",
        json={"weekly": [{"weekday": "W", "start_time": "10:00", "end_time": "15:00"}]},
    )
    assert response.status_code == 200
    assert [slot["weekday"] for slot in response.json()["weekly"]] == ["W"]


def test_empty_request_clears_availability(client):
    response = client.put("/api/observers/1/availability", json={})
    assert response.status_code == 200
    assert response.json()["weekly"] == []


@pytest.mark.parametrize(
    "weekly, message",
    [
        ([{"weekday": "S", "start_time": "09:00", "end_time": "10:00"}], "Weekday must be one of"),
        (
            [
                {"weekday": "M", "start_time": "09:00", "end_time": "10:00"},
                {"weekday": "m", "start_time": "11:00", "end_time": "12:00"},
            ],
            "listed more than once",
        ),
        ([{"weekday": "M", "start_time": "10:00", "end_time": "10:00"}], "start time must be before end time"),
    ],
)
def test_bad_weekly_slots_are_rejected(client, weekly, message):
    response = client.put("/api/observers/1/availability", json={"weekly": weekly})
    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert len(client.get("/api/observers/1/availability").json()["weekly"]) == 2


@pytest.mark.parametrize("days_from_today, message", [(-1, "in the past"), (61, "after the observation deadline")])
def test_bad_unavailable_dates_are_rejected(client, days_from_today, message):
    day = _campus_today() + timedelta(days=days_from_today)
    response = client.put("/api/observers/1/availability", json={"unavailable_dates": [str(day)]})
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_availability_locked_after_observation_deadline(client, monkeypatch):
    # The observation deadline is today + 60 in the tests.
    monkeypatch.setattr(observer_availability, "campus_now", lambda: cycle_deadlines.campus_now() + timedelta(days=61))
    response = client.put("/api/observers/1/availability", json={})
    assert response.status_code == 400
    assert "observation deadline" in response.json()["detail"]


def test_availability_unknown_professor(client):
    assert client.get("/api/observers/999/availability").status_code == 404
    assert client.put("/api/observers/999/availability", json={}).status_code == 404


# Matching now follows the database rule

def test_signup_preview_matches_database_rule(client):
    for signup_id in (1, 2, 3, 4):
        assert _eligible_ids(client, signup_id) == _db_eligible_ids(signup_id)
    assert _eligible_ids(client, 3) == [1]
    assert _eligible_ids(client, 4) == [7]


def test_preview_matches_saved_list(client, monkeypatch, fresh_signups):
    from app.api import observer_selection

    monkeypatch.setattr(observer_selection, "_today", lambda: _campus_today() + timedelta(days=31))
    client.post("/api/observer-selection/start")
    saved = client.get("/api/signups/3/observer-list").json()["observers"]
    assert [o["observer_id"] for o in saved] == _eligible_ids(client, 3)


def test_clearing_availability_removes_observer(client):
    assert _eligible_ids(client, 3) == [1]
    client.put("/api/observers/1/availability", json={})
    assert _eligible_ids(client, 3) == []
    client.put(
        "/api/observers/1/availability",
        json={"weekly": [{"weekday": "M", "start_time": "12:00", "end_time": "17:00"}]},
    )
    assert _eligible_ids(client, 3) == [1]


def test_unavailable_on_every_preferred_date_removes_observer(client):
    with _db() as conn:
        conn.execute(
            "INSERT INTO ObserverUnavailableDate VALUES (1, 2, '2026-10-26'), (1, 2, '2026-10-28')"
        )
    assert _eligible_ids(client, 3) == []


def test_match_observers_default_uses_signup(client):
    body = client.post("/api/match-observers", json={"faculty_id": 3}).json()
    assert body["signup_id"] == 3
    assert [o["observer_id"] for o in body["observers"]] == [1]


def test_match_observers_custom_day_and_time(client):
    def ids(payload):
        response = client.post("/api/match-observers", json=payload)
        assert response.status_code == 200
        return [o["observer_id"] for o in response.json()["observers"]]

    # Alice is available Mon/Wed 12:00 to 17:00.
    assert ids({"faculty_id": 3, "requested_day": "MW", "requested_time": "13:00-14:15"}) == [1]
    assert ids({"faculty_id": 3, "requested_day": "TR"}) == []
    assert ids({"faculty_id": 3, "requested_day": "M", "requested_time": "09:00-10:00"}) == []
    assert ids({"faculty_id": 3, "requested_day": "W", "requested_time": "16:30"}) == [1]
    # Grace is available Mon/Wed 08:00 to 17:00 and teaches nothing this term.
    assert ids({"faculty_id": 4, "requested_day": "W", "requested_time": "11:00-12:15"}) == [7]


def test_match_observers_skips_observer_teaching_then(client):
    # Alice teaches CS 1337 Mon/Wed 09:00 to 10:15.
    client.put(
        "/api/observers/1/availability",
        json={"weekly": [{"weekday": "M", "start_time": "08:00", "end_time": "17:00"}]},
    )
    assert client.post(
        "/api/match-observers", json={"faculty_id": 3, "requested_day": "M", "requested_time": "09:30"}
    ).json()["observers"] == []


def test_accepted_signup_is_not_insufficient(client):
    body = client.get("/api/observees/1/signup").json()
    assert body["status"] == "Accepted"
    assert body["insufficient"] is False
