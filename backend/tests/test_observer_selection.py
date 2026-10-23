"""AHC-247 start selection, AHC-246 insufficient-observer alerts, AHC-248 list ready notification."""

from datetime import timedelta

import psycopg
import pytest

from app.api import cycle_deadlines, observee_signup, observer_selection
from tests.conftest import TEST_DATABASE_URL, _raw_conninfo


def _campus_today():
    return cycle_deadlines.campus_now().date()


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def _next_weekday(start, weekday):
    return start + timedelta(days=(weekday - start.weekday()) % 7 or 7)


@pytest.fixture(autouse=True)
def _fresh(fresh_signups):
    # Phase 2 tests start from signups that haven't sent requests yet.
    return fresh_signups


@pytest.fixture
def after_signup_deadline(monkeypatch):
    # Cycle 2's signup deadline is today + 30 in the tests.
    later = _campus_today() + timedelta(days=31)
    monkeypatch.setattr(observer_selection, "_today", lambda: later)
    return later


def _add_math_observers(count):
    # Extra Mathematics professors who can all observe David's MATH 2413 (signup 4).
    with _db() as conn:
        for offset in range(count):
            professor_id = 100 + offset
            conn.execute(
                "INSERT INTO Professors VALUES (%s, %s, 3, 'Assistant Professor', 1)",
                (professor_id, f"Math Observer {offset:02d}"),
            )
            conn.execute(
                "INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (10, %s)",
                (professor_id,),
            )
            conn.execute(
                "INSERT INTO ObserverEnrollment (ProfessorID, CycleID) VALUES (%s, 2)",
                (professor_id,),
            )
            for weekday in ("M", "W"):
                conn.execute(
                    "INSERT INTO ObserverAvailability VALUES (%s, 2, %s, '08:00', '17:00')",
                    (professor_id, weekday),
                )


def _statuses():
    with _db() as conn:
        rows = conn.execute("SELECT SignupID, Status FROM ObservationSignup ORDER BY SignupID").fetchall()
    return dict(rows)


# AHC-247

def test_start_before_signup_deadline_is_rejected(client):
    response = client.post("/api/observer-selection/start")
    assert response.status_code == 400
    assert "after the signup deadline" in response.json()["detail"]
    assert _statuses()[3] == "Pending"


def test_start_saves_lists_and_sets_status(client, after_signup_deadline):
    response = client.post("/api/observer-selection/start")
    assert response.status_code == 200
    body = response.json()
    assert body["cycle_id"] == 2
    assert body["signup_count"] == 4
    signups = {s["signup_id"]: s for s in body["signups"]}
    assert [o["observer_id"] for o in signups[3]["observers"]] == [1]
    assert [o["observer_id"] for o in signups[4]["observers"]] == [7]
    assert signups[3]["status"] == "Matched"
    assert signups[4]["status"] == "Matched"
    assert body["matched_count"] == 2

    saved = client.get("/api/signups/3/observer-list").json()
    assert saved["list_saved"] is True
    assert [o["observer_id"] for o in saved["observers"]] == [1]


def test_start_leaves_accepted_signups_alone(client, after_signup_deadline):
    client.post("/api/observer-selection/start")
    statuses = _statuses()
    assert statuses[1] == "Accepted"
    assert statuses[2] == "Accepted"
    assert client.get("/api/signups/1/observer-list").json()["observers"] == []


def test_start_for_unknown_cycle(client, after_signup_deadline):
    assert client.post("/api/observer-selection/start", params={"cycle_id": 999}).status_code == 404


def test_saved_names_are_accepted_by_the_request_table(client, after_signup_deadline):
    # The database only allows ObserverRequests for eligible observers; saved names must pass.
    _add_math_observers(3)
    client.post("/api/observer-selection/start")
    observers = client.get("/api/signups/4/observer-list").json()["observers"]
    assert len(observers) == 4
    with _db() as conn:
        conn.execute("DELETE FROM ObserverRequest WHERE SignupID = 4")
        for number, observer in enumerate(observers, start=100):
            conn.execute(
                "INSERT INTO ObserverRequest (RequestID, SignupID, ObserverProfessorID, Status) "
                "VALUES (%s, 4, %s, 'Pending')",
                (number, observer["observer_id"]),
            )


# Saved list stays the same when more than five qualify

def test_more_than_five_eligible_saves_five_that_stay_the_same(client, after_signup_deadline):
    _add_math_observers(7)
    body = client.post("/api/observer-selection/start").json()
    picked = next(s for s in body["signups"] if s["signup_id"] == 4)
    assert picked["eligible_count"] == 8
    assert len(picked["observers"]) == 5
    picked_ids = [o["observer_id"] for o in picked["observers"]]

    for _ in range(5):
        again = client.get("/api/signups/4/observer-list").json()
        assert [o["observer_id"] for o in again["observers"]] == picked_ids

    client.post("/api/observer-selection/notify")
    notification = client.get("/api/observees/4/notifications").json()["notifications"][0]
    assert [o["observer_id"] for o in notification["observers"]] == picked_ids
    signup_page = client.get("/api/observees/4/signup").json()
    assert [o["observer_id"] for o in signup_page["observers"]] == picked_ids


def test_rerun_does_not_change_a_list_already_sent(client, after_signup_deadline):
    _add_math_observers(7)
    client.post("/api/observer-selection/start")
    sent = client.get("/api/signups/4/observer-list").json()["observers"]
    client.post("/api/observer-selection/notify", params={"signup_id": 4})
    for _ in range(5):
        client.post("/api/observer-selection/start")
        assert client.get("/api/signups/4/observer-list").json()["observers"] == sent
    assert _statuses()[4] == "List Ready"


# AHC-246

def test_alerts_flag_low_and_none(client, after_signup_deadline, monkeypatch):
    monkeypatch.setattr(observee_signup, "_today", _campus_today)
    created = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert created.status_code == 201

    body = client.get("/api/observer-selection/alerts").json()
    alerts = {a["signup_id"]: a for a in body["alerts"]}
    assert alerts[3]["level"] == "low"
    assert alerts[3]["eligible_count"] == 1
    assert alerts[4]["level"] == "low"
    new_id = created.json()["signup_id"]
    assert alerts[new_id]["level"] == "none"
    assert "No eligible observers" in alerts[new_id]["message"]
    assert body["no_match_count"] == 1
    assert 1 not in alerts and 2 not in alerts


def test_start_marks_no_match_signup_unmatched(client, after_signup_deadline):
    created = client.post("/api/signups", json={"professor_id": 5, "section_id": 6}).json()
    body = client.post("/api/observer-selection/start").json()
    signup = next(s for s in body["signups"] if s["signup_id"] == created["signup_id"])
    assert signup["status"] == "Unmatched"
    assert signup["observers"] == []
    assert any(a["signup_id"] == created["signup_id"] and a["level"] == "none" for a in body["alerts"])
    assert body["unmatched_count"] == 1


def test_no_alert_with_five_or_more(client, after_signup_deadline):
    _add_math_observers(4)
    alerts = client.get("/api/observer-selection/alerts").json()["alerts"]
    assert 4 not in [a["signup_id"] for a in alerts]


# AHC-248

def test_notify_before_start_does_nothing(client):
    body = client.post("/api/observer-selection/notify").json()
    assert body["notified_count"] == 0
    assert {s["signup_id"] for s in body["skipped"]} == {3, 4}
    assert client.get("/api/observees/3/notifications").json()["notifications"] == []


def test_notify_marks_list_ready_and_observee_sees_it(client, after_signup_deadline):
    client.post("/api/observer-selection/start")
    body = client.post("/api/observer-selection/notify").json()
    assert {n["signup_id"] for n in body["notified"]} == {3, 4}
    assert _statuses()[3] == "List Ready"

    notes = client.get("/api/observees/3/notifications").json()["notifications"]
    assert len(notes) == 1
    assert notes[0]["type"] == "observer_list_ready"
    assert {"signup_id", "status", "message", "observers"} <= set(notes[0])
    assert notes[0]["status"] == "List Ready"
    assert "CS 4347.001" in notes[0]["message"]
    assert [o["observer_id"] for o in notes[0]["observers"]] == [1]


def test_notify_one_signup(client, after_signup_deadline):
    client.post("/api/observer-selection/start")
    body = client.post("/api/observer-selection/notify", params={"signup_id": 3}).json()
    assert body["notified_count"] == 1
    assert _statuses()[3] == "List Ready"
    assert _statuses()[4] == "Matched"
    assert client.get("/api/observees/4/notifications").json()["notifications"] == []


def test_notify_skips_unmatched(client, after_signup_deadline):
    created = client.post("/api/signups", json={"professor_id": 5, "section_id": 6}).json()
    client.post("/api/observer-selection/start")
    body = client.post("/api/observer-selection/notify").json()
    skipped = {s["signup_id"]: s for s in body["skipped"]}
    assert skipped[created["signup_id"]]["reason"] == "No eligible observers were found"
    assert client.get("/api/observees/5/notifications").json()["notifications"] == []


def test_notify_unknown_signup(client):
    assert client.post("/api/observer-selection/notify", params={"signup_id": 999}).status_code == 404


def test_notifications_unknown_professor(client):
    assert client.get("/api/observees/999/notifications").status_code == 404


def test_observer_list_unknown_signup(client):
    assert client.get("/api/signups/999/observer-list").status_code == 404


# Signup fix for the new tables

def test_signup_saves_preferred_dates_and_enrolls_observer(client):
    tuesday = _next_weekday(_campus_today(), 1)
    thursday = _next_weekday(_campus_today(), 3)
    response = client.post(
        "/api/signups",
        json={"professor_id": 5, "section_id": 6, "preferred_dates": [str(thursday), str(tuesday), str(tuesday)]},
    )
    assert response.status_code == 201
    assert response.json()["preferred_dates"] == sorted([str(tuesday), str(thursday)])
    with _db() as conn:
        enrolled = conn.execute(
            "SELECT Status FROM ObserverEnrollment WHERE ProfessorID = 5 AND CycleID = 2"
        ).fetchone()
    assert enrolled == ("Active",)


@pytest.mark.parametrize(
    "days_from_today, weekday, message",
    [(-7, 1, "in the past"), (70, 1, "after the observation deadline"), (0, 0, "not a day this class meets")],
)
def test_signup_rejects_bad_preferred_dates(client, days_from_today, weekday, message):
    when = _next_weekday(_campus_today() + timedelta(days=days_from_today), weekday)
    if days_from_today < 0:
        when = _campus_today() - timedelta(days=(_campus_today().weekday() - weekday) % 7 or 7)
    response = client.post(
        "/api/signups", json={"professor_id": 5, "section_id": 6, "preferred_dates": [str(when)]}
    )
    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert client.get("/api/observees/5/signup").status_code == 404
