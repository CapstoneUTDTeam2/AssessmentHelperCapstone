"""Local tester clock and rank writes. Not a process role."""

from datetime import date, timedelta

from app.api import cycle_deadlines


def _now():
    return cycle_deadlines.campus_now().replace(microsecond=0)


def test_clock_override_moves_cycle_phase(client):
    before = client.get("/api/evaluation-cycles/current").json()
    assert before["phase"] == "signup"

    frozen = (_now() + timedelta(days=31)).replace(microsecond=0)
    response = client.put("/api/test/clock", json={"frozen_at": frozen.isoformat(timespec="seconds")})
    assert response.status_code == 200
    assert response.json()["frozen"] is True

    after = client.get("/api/evaluation-cycles/current").json()
    assert after["today"] == frozen.date().isoformat()
    assert after["phase"] == "observation"

    cleared = client.put("/api/test/clock", json={"frozen_at": None})
    assert cleared.status_code == 200
    assert cleared.json()["frozen"] is False


def test_rank_change_updates_evaluation_frequency(client):
    alice = client.get("/api/evaluation-status/1").json()
    assert alice["current_level"] == "Assistant Professor"
    assert alice["frequency_years"] == 1

    response = client.put(
        "/api/test/professors/1",
        json={"current_level": "Full Professor"},
    )
    assert response.status_code == 200
    assert response.json()["current_level"] == "Full Professor"

    updated = client.get("/api/evaluation-status/1").json()
    assert updated["frequency_years"] == 2


def test_randomize_unknowns_fills_rank_and_last_eval(client):
    response = client.post("/api/test/randomize-unknowns")
    assert response.status_code == 200
    body = response.json()
    after = client.get("/api/evaluation-status").json()["professors"]
    still_unknown = [p for p in after if p["status"] == "Unknown"]
    assert body["filled"] >= 1
    assert len(still_unknown) < body["unknown_before"] or body["filled"] == 0


def _term_key(semester, year):
    return (year, 0 if semester == "Spring" else 1)


def _last_eval_term(completed_on: date):
    if completed_on.month <= 5:
        return ("Spring", completed_on.year)
    return ("Fall", completed_on.year)


def test_randomize_clears_current_cycle_observations(client):
    before = client.get("/api/observations").json()["observations"]
    assert before, "seed DML has current-cycle observations"
    response = client.post("/api/test/randomize-unknowns")
    assert response.status_code == 200
    body = response.json()
    assert body["current_observations_cleared"] >= len(before)
    current = client.get("/api/observations").json()["observations"]
    assert current == []
    professors = client.get("/api/evaluation-status").json()["professors"]
    with_last_eval = [p for p in professors if p["last_evaluation_date"]]
    assert with_last_eval
    cycle = client.get("/api/test/harness").json()["current_cycle"]
    current_key = _term_key(cycle["semester"], cycle["year"])
    for professor in with_last_eval:
        last = date.fromisoformat(professor["last_evaluation_date"])
        assert _term_key(*_last_eval_term(last)) < current_key


def test_randomize_start_term_is_before_last_eval(client):
    response = client.post("/api/test/randomize-unknowns")
    assert response.status_code == 200
    terms = {
        term["term_id"]: (term["semester"], term["year"])
        for term in client.get("/api/test/harness").json()["terms"]
    }
    current = client.get("/api/test/harness").json()["current_cycle"]
    current_key = _term_key(current["semester"], current["year"])
    professors = client.get("/api/evaluation-status").json()["professors"]
    checked = 0
    for professor in professors:
        if not professor["last_evaluation_date"] or not professor["start_term_id"]:
            continue
        start = terms[professor["start_term_id"]]
        last = date.fromisoformat(professor["last_evaluation_date"])
        assert _term_key(*start) < _term_key(*_last_eval_term(last))
        assert _term_key(*start) < current_key
        checked += 1
    assert checked > 0


def test_randomize_observer_pool_is_only_signups(client):
    client.post("/api/test/randomize-unknowns")
    pool = client.get("/api/observer-pool").json()["observers"]
    assert pool == []


def test_begin_cycle_freezes_before_signup_deadline(client):
    cycle = client.get("/api/evaluation-cycles/current").json()
    response = client.post("/api/test/begin-cycle")
    assert response.status_code == 200
    assert response.json()["frozen"] is True
    today = response.json()["now"][:10]
    assert today < cycle["deadlines"][0]["date"]


def test_harness_lists_process_ranks_and_terms(client):
    body = client.get("/api/test/harness").json()
    assert body["timezone"] == "America/Chicago"
    assert body["ranks"] == [
        "Assistant Professor",
        "Associate Professor",
        "Full Professor",
    ]
    assert any(term["semester"] == "Fall" and term["year"] == 2026 for term in body["terms"])
    assert body["current_cycle"]["semester"] == "Fall"


def test_demo_pair_are_due_unsigned_and_distinct(client):
    client.post("/api/test/randomize-unknowns")
    body = client.get("/api/test/demo-pair").json()
    assert "pair" in body
    if body["pair"] is None:
        return
    left, right = body["pair"]["a"], body["pair"]["b"]
    assert left["professor_id"] != right["professor_id"]
    assert left["status"] == "Due"
    assert right["status"] == "Due"
    assert left["course_level"] == right["course_level"]
    due = {
        row["professor_id"]
        for row in client.get("/api/evaluation-status").json()["professors"]
        if row["status"] == "Due"
    }
    assert left["professor_id"] in due
    assert right["professor_id"] in due
