"""One evaluation cycle start to finish through the API, in the order the process doc describes."""

from datetime import timedelta

import psycopg

from app.api import cycle_deadlines, observer_selection
from tests.conftest import TEST_DATABASE_URL, _next_weekday, _raw_conninfo


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def test_full_cycle(client, monkeypatch):
    today = cycle_deadlines.campus_now().date()
    tuesday, thursday = _next_weekday(today, 1), _next_weekday(today, 3)

    # Setup: a Biology colleague who can observe Emily's BIOL 1301 (Tue/Thu 13:00).
    with _db() as conn:
        conn.execute("INSERT INTO Professors VALUES (500, 'Bio Observer', 4, 'Full Professor', 1)")
        conn.execute("INSERT INTO Sections VALUES (50, '002', 6, 4, 'TR', '09:00', '10:15')")  # BIOL 1301 last spring
        conn.execute("INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (50, 500)")
    assert client.put(
        "/api/observers/500/availability",
        json={"weekly": [{"weekday": "T", "start_time": "08:00", "end_time": "17:00"},
                         {"weekday": "R", "start_time": "08:00", "end_time": "17:00"}]},
    ).status_code == 200

    # 1. Emily signs up with two preferred dates.
    signup = client.post(
        "/api/signups", json={"professor_id": 5, "section_id": 6, "preferred_dates": [str(tuesday), str(thursday)]}
    )
    assert signup.status_code == 201
    signup_id = signup.json()["signup_id"]

    # 2. Committee can't start before the signup deadline, then can after it.
    assert client.post("/api/observer-selection/start").status_code == 400
    monkeypatch.setattr(observer_selection, "_today", lambda: today + timedelta(days=31))
    started = client.post("/api/observer-selection/start").json()
    emily = next(s for s in started["signups"] if s["signup_id"] == signup_id)
    assert emily["status"] == "Matched" and [o["observer_id"] for o in emily["observers"]] == [500]
    assert any(a["signup_id"] == signup_id and a["level"] == "low" for a in started["alerts"])

    # 3. Committee notifies; Emily sees her list.
    client.post("/api/observer-selection/notify", params={"signup_id": signup_id})
    notes = client.get("/api/observees/5/notifications").json()["notifications"]
    assert notes[0]["type"] == "observer_list_ready"

    # 4. Emily sends a request; the observer sees it and accepts.
    sent = client.post("/api/observer-requests", json={"signup_id": signup_id, "observee_id": 5, "observer_ids": [500]})
    assert sent.status_code == 201
    incoming = client.get("/api/observer-requests", params={"observer_id": 500}).json()["requests"]
    assert incoming[0]["proposed_dates"] == [str(tuesday), str(thursday)]
    rid = incoming[0]["request_id"]
    assert client.post(f"/api/observer-requests/{rid}/accept", json={"observer_id": 500}).status_code == 200

    # 5. Emily chooses him for Thursday; the observation is stored.
    chosen = client.post(
        f"/api/signups/{signup_id}/select-observer",
        json={"observee_id": 5, "observer_id": 500, "observation_date": str(thursday)},
    )
    assert chosen.status_code == 201
    observation_id = chosen.json()["observation_id"]

    # 6. The observation happens (move it to the past), the observer fills the form, both sign.
    with _db() as conn:
        past = today - timedelta(days=1)
        conn.execute(
            "UPDATE Observation SET ScheduledDate = %s, ObservationDate = %s WHERE ObservationID = %s",
            (past, past, observation_id),
        )
    form = client.get(f"/api/observations/{observation_id}").json()
    ratings = [{"criterion_id": c["criterion_id"], "rating": 4} for c in form["criteria"]]
    assert client.put(
        f"/api/observations/{observation_id}/ratings",
        json={"observer_id": 500, "ratings": ratings, "summary": "Engaging lecture."},
    ).status_code == 200
    assert client.post(f"/api/observations/{observation_id}/sign", json={"professor_id": 500}).status_code == 200
    done = client.post(f"/api/observations/{observation_id}/sign", json={"professor_id": 5}).json()
    assert done["status"] == "Completed" and done["locked"] is True
    assert client.get("/api/evaluation-status/5").json()["last_evaluation_date"] == today.isoformat()

    # 7. Observation period ends: committee sends the survey notice, Emily answers it.
    client.put(
        "/api/evaluation-cycles/2/deadlines",
        json={"signup": str(today - timedelta(days=20)), "observation": str(today - timedelta(days=1)),
              "post_observation_feedback": str(today + timedelta(days=10)),
              "app_feedback": str(today + timedelta(days=10))},
    )
    assert client.post("/api/surveys/notify").status_code == 200
    assert client.get("/api/observees/5/notifications").json()["notifications"][0]["type"] == "survey_open"
    assert client.post(
        "/api/surveys", json={"professor_id": 5, "role": "Observee", "process_ok": True}
    ).status_code == 201

    # 8. KPIs count Emily as going through the whole process.
    kpis = client.get("/api/kpis").json()
    assert kpis["survey_completion_rate"]["completed_full_process"] == 3
    assert kpis["evaluation_eligibility_accuracy"]["percent"] == 100.0
    assert client.get("/api/reports/unmatched-faculty").json()["count"] == 0
