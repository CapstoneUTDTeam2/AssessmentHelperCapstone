"""AHC-223: evaluation cycle deadline handling."""

from datetime import date, datetime, timedelta, timezone

import pytest

from app.api import cycle_deadlines


def _today():
    return cycle_deadlines.campus_now().date()


def _days(n):
    return (_today() + timedelta(days=n)).isoformat()


def _pin_today(monkeypatch, offset_days):
    pinned = _today() + timedelta(days=offset_days)
    monkeypatch.setattr(cycle_deadlines, "_today", lambda: pinned)


def _deadline(body, key):
    return next(d for d in body["deadlines"] if d["key"] == key)


def test_current_cycle_deadlines(client):
    response = client.get("/api/evaluation-cycles/current")
    assert response.status_code == 200
    body = response.json()
    assert body["cycle_id"] == 2
    assert (body["semester"], body["year"]) == ("Fall", 2026)
    assert body["phase"] == "signup"
    assert [d["key"] for d in body["deadlines"]] == [
        "signup",
        "observation",
        "post_observation_feedback",
        "app_feedback",
    ]
    assert _deadline(body, "signup")["date"] == _days(30)
    assert _deadline(body, "signup")["days_left"] == 30
    assert all(d["is_open"] for d in body["deadlines"])
    assert body["next_deadline"]["key"] == "signup"


def test_list_cycles_newest_first(client):
    response = client.get("/api/evaluation-cycles")
    assert response.status_code == 200
    cycles = response.json()["cycles"]
    assert [c["cycle_id"] for c in cycles] == [2, 1]


def test_past_cycle_is_closed(client):
    response = client.get("/api/evaluation-cycles/1")
    assert response.status_code == 200
    body = response.json()
    assert body["phase"] == "closed"
    assert body["next_deadline"] is None
    assert not any(d["is_open"] for d in body["deadlines"])
    assert _deadline(body, "signup")["days_left"] < 0


def test_unknown_cycle(client):
    assert client.get("/api/evaluation-cycles/999").status_code == 404


@pytest.mark.parametrize(
    "offset, phase, next_key",
    [
        (0, "signup", "signup"),
        (30, "signup", "signup"),  # deadline day itself is still open
        (31, "observation", "observation"),
        (61, "post_observation_feedback", "post_observation_feedback"),
        (91, "closed", None),
    ],
)
def test_phase_follows_deadlines(client, monkeypatch, offset, phase, next_key):
    _pin_today(monkeypatch, offset)
    body = client.get("/api/evaluation-cycles/current").json()
    assert body["phase"] == phase
    if next_key is None:
        assert body["next_deadline"] is None
    else:
        assert body["next_deadline"]["key"] == next_key


def test_deadline_day_has_zero_days_left(client, monkeypatch):
    _pin_today(monkeypatch, 30)
    body = client.get("/api/evaluation-cycles/current").json()
    signup = _deadline(body, "signup")
    assert signup["is_open"] is True
    assert signup["days_left"] == 0


def test_app_feedback_phase_when_it_ends_last(client, monkeypatch):
    client.put("/api/evaluation-cycles/2/deadlines", json={"app_feedback": _days(120)})
    _pin_today(monkeypatch, 100)
    body = client.get("/api/evaluation-cycles/current").json()
    assert body["phase"] == "app_feedback"
    assert body["next_deadline"]["key"] == "app_feedback"


def test_extend_signup_deadline(client):
    response = client.put(
        "/api/evaluation-cycles/2/deadlines", json={"signup": _days(45)}
    )
    assert response.status_code == 200
    assert _deadline(response.json(), "signup")["date"] == _days(45)
    body = client.get("/api/evaluation-cycles/2").json()
    assert _deadline(body, "signup")["date"] == _days(45)
    assert _deadline(body, "observation")["date"] == _days(60)
    assert _deadline(body, "app_feedback")["date"] == _days(90)


def test_update_several_deadlines_at_once(client):
    response = client.put(
        "/api/evaluation-cycles/2/deadlines",
        json={
            "observation": _days(70),
            "post_observation_feedback": _days(100),
            "app_feedback": _days(110),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert _deadline(body, "observation")["date"] == _days(70)
    assert _deadline(body, "post_observation_feedback")["date"] == _days(100)
    assert _deadline(body, "app_feedback")["date"] == _days(110)


@pytest.mark.parametrize(
    "field, offset, message",
    [
        ("signup", 61, "Signup deadline must be on or before the observation deadline"),
        ("observation", 91, "Observation deadline must be on or before the post-observation feedback deadline"),
        ("app_feedback", 59, "App feedback deadline must be on or after the observation deadline"),
    ],
)
def test_deadlines_out_of_order_are_rejected(client, field, offset, message):
    response = client.put(
        "/api/evaluation-cycles/2/deadlines", json={field: _days(offset)}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == message
    body = client.get("/api/evaluation-cycles/2").json()
    assert _deadline(body, "signup")["date"] == _days(30)
    assert _deadline(body, "observation")["date"] == _days(60)
    assert _deadline(body, "app_feedback")["date"] == _days(90)


def test_update_with_no_dates(client):
    response = client.put("/api/evaluation-cycles/2/deadlines", json={})
    assert response.status_code == 400


def test_update_unknown_cycle(client):
    response = client.put(
        "/api/evaluation-cycles/999/deadlines", json={"signup": _days(10)}
    )
    assert response.status_code == 404


def test_update_with_bad_date(client):
    response = client.put(
        "/api/evaluation-cycles/2/deadlines", json={"signup": "not-a-date"}
    )
    assert response.status_code == 422


def test_closing_and_reopening_signup(client):
    yesterday = _days(-1)
    closed = client.put("/api/evaluation-cycles/2/deadlines", json={"signup": yesterday})
    assert closed.status_code == 200
    assert client.get("/api/evaluation-cycles/current").json()["phase"] == "observation"

    blocked = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert blocked.status_code == 400
    assert blocked.json()["detail"] == f"The signup deadline for this cycle was {yesterday}"

    reopened = client.put("/api/evaluation-cycles/2/deadlines", json={"signup": _days(7)})
    assert reopened.status_code == 200
    allowed = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert allowed.status_code == 201


def test_dates_before_deadline_helper():
    TODAY = date(2026, 10, 13)
    cycle = {
        "signupdeadline": TODAY,
        "observationdeadline": TODAY + timedelta(days=10),
        "postobservationfeedbackdeadline": TODAY + timedelta(days=20),
        "appfeedbackdeadline": TODAY + timedelta(days=20),
    }
    on_deadline = [TODAY + timedelta(days=3), TODAY + timedelta(days=10)]
    one_late = [TODAY + timedelta(days=3), TODAY + timedelta(days=11)]
    assert cycle_deadlines.dates_before_deadline(cycle, "observation", on_deadline)
    assert not cycle_deadlines.dates_before_deadline(cycle, "observation", one_late)


def test_today_is_campus_date_not_utc(client):
    utc_now = datetime.now(timezone.utc)
    campus = cycle_deadlines.campus_now()
    hours_behind_utc = (utc_now.replace(tzinfo=None) - campus).total_seconds() / 3600
    assert round(hours_behind_utc) in (5, 6)
    body = client.get("/api/evaluation-cycles/current").json()
    assert body["today"] == campus.date().isoformat()


def test_evening_signup_on_deadline_day_is_allowed(client, monkeypatch):
    client.put("/api/evaluation-cycles/2/deadlines", json={"signup": _days(0)})
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert response.status_code == 201
    assert response.json()["signup_date"] == _days(0)
