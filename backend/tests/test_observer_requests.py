"""Phase 3: send requests (AHC-261), dates before the deadline (AHC-262), incoming requests (AHC-263),
accepted confirmations (AHC-264), choosing an observer (AHC-265), graceful declines (AHC-266),
and storing the final observer (AHC-267)."""

from datetime import timedelta

import psycopg
import pytest

from app.api import cycle_deadlines, observer_requests, observer_selection
from tests.conftest import TEST_DATABASE_URL, _next_weekday, _raw_conninfo


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def _today():
    return cycle_deadlines.campus_now().date()


def _add_cs_observers(count):
    """Extra Computer Science observers who can all observe Carol's CS 4347 (signup 3)."""
    with _db() as conn:
        for offset in range(count):
            pid = 300 + offset
            conn.execute("INSERT INTO Professors VALUES (%s, %s, 1, 'Assistant Professor', 1)", (pid, f"CS Observer {offset}"))
            conn.execute("INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (9, %s)", (pid,))
            conn.execute("INSERT INTO ObserverEnrollment (ProfessorID, CycleID) VALUES (%s, 2)", (pid,))
            for day in ("M", "W"):
                conn.execute("INSERT INTO ObserverAvailability VALUES (%s, 2, %s, '08:00', '17:00')", (pid, day))
    return [300 + offset for offset in range(count)]


@pytest.fixture
def list_ready(client, monkeypatch, fresh_signups):
    """Run Phase 2 (start selection and notify) so Carol and David have List Ready signups."""
    monkeypatch.setattr(observer_selection, "_today", lambda: _today() + timedelta(days=31))
    assert client.post("/api/observer-selection/start").status_code == 200
    assert client.post("/api/observer-selection/notify").json()["notified_count"] == 2
    return fresh_signups


def _send(client, observer_ids, signup_id=3, observee_id=3, **extra):
    return client.post(
        "/api/observer-requests",
        json={"signup_id": signup_id, "observee_id": observee_id, "observer_ids": observer_ids, **extra},
    )


def _request_id(client, observer_id, signup_id=3):
    rows = client.get(f"/api/signups/{signup_id}/requests").json()["requests"]
    return next(r["request_id"] for r in rows if r["observer_id"] == observer_id)


def _status(signup_id):
    with _db() as conn:
        return conn.execute("SELECT Status FROM ObservationSignup WHERE SignupID = %s", (signup_id,)).fetchone()[0]


# Phase 2 interaction

def test_start_skips_signups_that_already_have_requests(client, monkeypatch):
    # Sample data: Carol and David already have accepted requests and scheduled observations.
    monkeypatch.setattr(observer_selection, "_today", lambda: _today() + timedelta(days=31))
    body = client.post("/api/observer-selection/start").json()
    statuses = {s["signup_id"]: s["status"] for s in body["signups"]}
    assert statuses[3] == "Pending" and statuses[4] == "Pending"
    assert body["matched_count"] == 0
    assert client.get("/api/observer-selection/alerts").json()["alert_count"] == 0


# AHC-261 and AHC-262: sending requests

def test_send_request(client, list_ready):
    response = _send(client, [1])
    assert response.status_code == 201
    [request] = response.json()["requests"]
    assert request["status"] == "Pending"
    assert request["observer_name"] == "Alice Johnson"
    assert request["observee_name"] == "Carol Williams"
    assert request["course_code"] == "CS 4347"
    assert request["proposed_dates"] == [str(list_ready["monday"]), str(list_ready["wednesday"])]
    assert request["expires_at"] is not None
    assert _status(3) == "Requests Sent"


def test_send_to_subset_then_more_later(client, list_ready):
    extra = _add_cs_observers(5)
    # Rerun start so the saved list includes the new observers (Carol has not sent requests yet).
    with _db() as conn:
        conn.execute("UPDATE ObservationSignup SET Status = 'Pending' WHERE SignupID = 3")
    client.post("/api/observer-selection/start")
    client.post("/api/observer-selection/notify", params={"signup_id": 3})
    saved = [o["observer_id"] for o in client.get("/api/signups/3/observer-list").json()["observers"]]
    assert len(saved) == 5 and set(saved) <= set([1] + extra)
    assert _send(client, saved[:2]).status_code == 201
    assert _send(client, saved[2:]).status_code == 201
    assert len(client.get("/api/signups/3/requests").json()["requests"]) == 5


def test_send_requires_list_ready(client, fresh_signups):
    response = _send(client, [1])
    assert response.status_code == 400
    assert "observer list is ready" in response.json()["detail"]


def test_send_only_by_the_observee(client, list_ready):
    assert _send(client, [1], observee_id=4).status_code == 403


def test_send_only_to_observers_on_the_saved_list(client, list_ready):
    response = _send(client, [2])
    assert response.status_code == 400
    assert "not on this signup's observer list" in response.json()["detail"]


def test_send_twice_to_same_observer(client, list_ready):
    assert _send(client, [1]).status_code == 201
    assert _send(client, [1]).status_code == 409


def test_send_needs_at_least_one_observer(client, list_ready):
    assert _send(client, []).status_code == 400


def test_send_with_new_proposed_dates(client, list_ready):
    next_monday = list_ready["monday"] + timedelta(days=7)
    response = _send(client, [1], proposed_dates=[str(next_monday)])
    assert response.status_code == 201
    assert response.json()["requests"][0]["proposed_dates"] == [str(next_monday)]


@pytest.mark.parametrize(
    "days_after_monday, message",
    [(1, "not a day this class meets"), (63, "after the observation deadline")],
)
def test_proposed_dates_are_checked(client, list_ready, days_after_monday, message):
    # Monday + 63 days is still a Monday, but past the deadline (today + 60).
    bad = list_ready["monday"] + timedelta(days=days_after_monday)
    response = _send(client, [1], proposed_dates=[str(bad)])
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_past_proposed_date_is_rejected(client, list_ready):
    last_monday = list_ready["monday"] - timedelta(days=7)
    response = _send(client, [1], proposed_dates=[str(last_monday)])
    assert response.status_code == 400
    assert "in the past" in response.json()["detail"]


def test_dates_cannot_change_after_first_send(client, list_ready):
    extra = _add_cs_observers(1)
    with _db() as conn:
        conn.execute("INSERT INTO SignupObserverList VALUES (3, %s, CURRENT_DATE)", (extra[0],))
    _send(client, [1])
    response = _send(client, extra, proposed_dates=[str(list_ready["monday"])])
    assert response.status_code == 400


def test_existing_dates_past_deadline_block_sending(client, list_ready):
    # The committee moves the observation deadline before Carol's proposed dates.
    response = client.put(
        "/api/evaluation-cycles/2/deadlines",
        json={
            "signup": str(_today() - timedelta(days=1)),
            "observation": str(list_ready["monday"] - timedelta(days=1)),
        },
    )
    assert response.status_code == 200
    response = _send(client, [1])
    assert response.status_code == 400
    assert "after the observation deadline" in response.json()["detail"]


def test_no_future_dates_blocks_sending(client, list_ready):
    with _db() as conn:
        conn.execute("DELETE FROM SignupPreferredDate WHERE SignupID = 3")
    response = _send(client, [1])
    assert response.status_code == 400
    assert "proposed date" in response.json()["detail"]


def test_unknown_signup(client):
    assert _send(client, [1], signup_id=999).status_code == 404


# AHC-263: observer sees incoming requests

def test_observer_sees_incoming_requests(client, list_ready):
    _send(client, [1])
    body = client.get("/api/observer-requests", params={"observer_id": 1}).json()
    assert body["pending_count"] == 1
    assert body["max_confirmations"] == 3
    request = next(r for r in body["requests"] if r["signup_id"] == 3)
    assert request["observee_name"] == "Carol Williams"
    assert request["meeting_days"] == "MW"
    assert request["start_time"] == "13:00"


def test_incoming_requests_unknown_observer(client):
    assert client.get("/api/observer-requests", params={"observer_id": 999}).status_code == 404


def test_incoming_requests_require_observer_id(client):
    assert client.get("/api/observer-requests").status_code == 422


# Accept and decline

def test_accept_and_decline(client, list_ready):
    _send(client, [1])
    _send(client, [7], signup_id=4, observee_id=4)
    accept = client.post(f"/api/observer-requests/{_request_id(client, 1)}/accept", json={"observer_id": 1})
    assert accept.status_code == 200 and accept.json()["status"] == "Accepted"
    decline = client.post(
        f"/api/observer-requests/{_request_id(client, 7, 4)}/decline", json={"observer_id": 7}
    )
    assert decline.status_code == 200 and decline.json()["status"] == "Declined"


def test_only_the_invited_observer_can_answer(client, list_ready):
    _send(client, [1])
    response = client.post(f"/api/observer-requests/{_request_id(client, 1)}/accept", json={"observer_id": 2})
    assert response.status_code == 403


def test_cannot_answer_twice(client, list_ready):
    _send(client, [1])
    rid = _request_id(client, 1)
    client.post(f"/api/observer-requests/{rid}/accept", json={"observer_id": 1})
    assert client.post(f"/api/observer-requests/{rid}/decline", json={"observer_id": 1}).status_code == 409


def test_expired_request_cannot_be_accepted(client, list_ready):
    _send(client, [1])
    rid = _request_id(client, 1)
    with _db() as conn:
        conn.execute(
            "UPDATE ObserverRequest SET ExpirationDate = CURRENT_DATE - 1 WHERE RequestID = %s", (rid,)
        )
    assert client.get("/api/signups/3/requests").json()["requests"][0]["status"] == "Expired"
    response = client.post(f"/api/observer-requests/{rid}/accept", json={"observer_id": 1})
    assert response.status_code == 400
    assert "expired" in response.json()["detail"]


def test_request_expires_after_48_hours(client, list_ready):
    before = cycle_deadlines.campus_now().replace(microsecond=0)
    request = _send(client, [1]).json()["requests"][0]
    from datetime import datetime

    expires = datetime.fromisoformat(request["expires_at"])
    assert timedelta(hours=47, minutes=59) <= expires - before <= timedelta(hours=48, minutes=1)


def test_observer_can_confirm_at_most_three(client, list_ready, monkeypatch):
    monkeypatch.setattr(observer_requests, "MAX_CONFIRMATIONS_PER_CYCLE", 1)
    # A second CS 4347 signup that Alice can also observe.
    with _db() as conn:
        conn.execute("INSERT INTO Professors VALUES (400, 'Second Observee', 1, 'Assistant Professor', 1)")
        conn.execute("INSERT INTO Sections VALUES (40, '002', 3, 5, 'MW', '13:00', '14:15')")
        conn.execute("INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (40, 400)")
    signup = client.post(
        "/api/signups",
        json={"professor_id": 400, "section_id": 40, "preferred_dates": [str(list_ready["monday"])]},
    ).json()
    with _db() as conn:
        conn.execute("UPDATE ObservationSignup SET Status = 'List Ready' WHERE SignupID = %s", (signup["signup_id"],))
        conn.execute("INSERT INTO SignupObserverList VALUES (%s, 1, CURRENT_DATE)", (signup["signup_id"],))
    _send(client, [1])
    assert _send(client, [1], signup_id=signup["signup_id"], observee_id=400).status_code == 201
    first = client.post(f"/api/observer-requests/{_request_id(client, 1)}/accept", json={"observer_id": 1})
    assert first.status_code == 200
    second = client.post(
        f"/api/observer-requests/{_request_id(client, 1, signup['signup_id'])}/accept", json={"observer_id": 1}
    )
    assert second.status_code == 409
    assert "already confirmed 1" in second.json()["detail"]


# AHC-264: accepted confirmations

def test_accepted_confirmations(client, list_ready):
    _send(client, [1])
    client.post(f"/api/observer-requests/{_request_id(client, 1)}/accept", json={"observer_id": 1})
    accepted = client.get("/api/observer-requests/accepted", params={"observer_id": 1}).json()["accepted"]
    mine = [a for a in accepted if a["signup_id"] == 3]
    assert len(mine) == 1 and mine[0]["selected"] is False


# AHC-265, AHC-266, AHC-267: choosing an observer

def _three_requests(client, list_ready):
    """Carol sends to Alice and two extra observers; Alice and observer 300 confirm, 301 doesn't answer."""
    extra = _add_cs_observers(2)
    with _db() as conn:
        for pid in extra:
            conn.execute("INSERT INTO SignupObserverList VALUES (3, %s, CURRENT_DATE)", (pid,))
    assert _send(client, [1] + extra).status_code == 201
    for pid in (1, extra[0]):
        assert client.post(
            f"/api/observer-requests/{_request_id(client, pid)}/accept", json={"observer_id": pid}
        ).status_code == 200
    return extra


def test_choose_observer_stores_observation_and_declines_others(client, list_ready):
    extra = _three_requests(client, list_ready)
    response = client.post(
        "/api/signups/3/select-observer",
        json={"observee_id": 3, "observer_id": 1, "observation_date": str(list_ready["wednesday"])},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["observation_date"] == str(list_ready["wednesday"])
    assert body["start_time"] == "13:00"
    assert [d["observer_name"] for d in body["graceful_declines"]] == ["CS Observer 0"]
    assert [d["observer_name"] for d in body["withdrawn_requests"]] == ["CS Observer 1"]

    with _db() as conn:
        observation = conn.execute(
            "SELECT ObserverProfessorID, ObserveeID, TemplateID, Status, ScheduledDate FROM Observation WHERE SignupID = 3"
        ).fetchone()
    assert observation == (1, 3, 2, "Scheduled", list_ready["wednesday"])
    assert _status(3) == "Accepted"

    statuses = {r["observer_id"]: r["status"] for r in client.get("/api/signups/3/requests").json()["requests"]}
    assert statuses == {1: "Accepted", extra[0]: "Not Selected", extra[1]: "Cancelled"}

    declined = client.get("/api/observer-requests", params={"observer_id": extra[0]}).json()["requests"][0]
    assert "chose another observer" in declined["message"]
    accepted = client.get("/api/observer-requests/accepted", params={"observer_id": 1}).json()["accepted"]
    assert next(a for a in accepted if a["signup_id"] == 3)["selected"] is True


def test_choose_defaults_to_first_proposed_date(client, list_ready):
    _three_requests(client, list_ready)
    body = client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": 1}).json()
    assert body["observation_date"] == str(list_ready["monday"])


def test_choose_only_confirmed_observer(client, list_ready):
    extra = _three_requests(client, list_ready)
    response = client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": extra[1]})
    assert response.status_code == 400
    assert "confirmed" in response.json()["detail"]


def test_choose_date_must_be_proposed(client, list_ready):
    _three_requests(client, list_ready)
    other = list_ready["monday"] + timedelta(days=7)
    response = client.post(
        "/api/signups/3/select-observer",
        json={"observee_id": 3, "observer_id": 1, "observation_date": str(other)},
    )
    assert response.status_code == 400


def test_choose_only_once(client, list_ready):
    _three_requests(client, list_ready)
    first = client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": 1})
    assert first.status_code == 201
    again = client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": 1})
    assert again.status_code == 409


def test_choose_only_by_the_observee(client, list_ready):
    _three_requests(client, list_ready)
    assert client.post("/api/signups/3/select-observer", json={"observee_id": 1, "observer_id": 1}).status_code == 403


def test_no_answers_or_sending_after_choice(client, list_ready):
    extra = _three_requests(client, list_ready)
    client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": 1})
    cancelled = _request_id(client, extra[1])
    assert client.post(f"/api/observer-requests/{cancelled}/accept", json={"observer_id": extra[1]}).status_code == 409
    assert _send(client, [extra[1]]).status_code == 409


def test_not_selected_frees_up_a_confirmation(client, list_ready, monkeypatch):
    # Observer 300's confirmation for Carol is released when Carol picks Alice.
    extra = _three_requests(client, list_ready)
    client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": 1})
    body = client.get("/api/observer-requests", params={"observer_id": extra[0]}).json()
    assert body["confirmed_count"] == 0


def test_full_flow_end_to_end(client, list_ready):
    # David (signup 4) and Grace: list ready, send, accept, choose.
    assert _send(client, [7], signup_id=4, observee_id=4).status_code == 201
    rid = _request_id(client, 7, 4)
    assert client.post(f"/api/observer-requests/{rid}/accept", json={"observer_id": 7}).status_code == 200
    chosen = client.post("/api/signups/4/select-observer", json={"observee_id": 4, "observer_id": 7})
    assert chosen.status_code == 201
    signup_page = client.get("/api/observees/4/signup").json()
    assert signup_page["status"] == "Accepted"
    assert signup_page["insufficient"] is False


def test_choose_works_after_a_confirmed_observer_changes_availability(client, list_ready):
    # Needs the trigger fix: validate_observer_qualification only checks on insert or when the observer changes.
    extra = _three_requests(client, list_ready)
    client.put(f"/api/observers/{extra[0]}/availability", json={})
    response = client.post("/api/signups/3/select-observer", json={"observee_id": 3, "observer_id": 1})
    assert response.status_code == 201
    assert [d["observer_name"] for d in response.json()["graceful_declines"]] == ["CS Observer 0"]


def test_database_still_blocks_requests_to_ineligible_observers(client, list_ready):
    with _db() as conn, pytest.raises(psycopg.errors.RaiseException):
        conn.execute("INSERT INTO ObserverRequest (RequestID, SignupID, ObserverProfessorID, Status) VALUES (77, 3, 2, 'Pending')")
