"""AHC-224 signup, AHC-226 one course per cycle, AHC-227 observer pool."""

from datetime import timedelta

from app.api import cycle_deadlines, observee_signup


def _campus_today():
    return cycle_deadlines.campus_now().date()


def _pool_ids(client, cycle_id=None):
    params = {"cycle_id": cycle_id} if cycle_id is not None else {}
    response = client.get("/api/observer-pool", params=params)
    assert response.status_code == 200
    return [observer["professor_id"] for observer in response.json()["observers"]]


def test_signup_creates_pending_signup(client):
    response = client.post(
        "/api/signups",
        json={"professor_id": 5, "section_id": 6, "preferred_times": "Tuesday afternoon"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["signup_id"] == 5
    assert body["cycle_id"] == 2
    assert body["professor_id"] == 5
    assert body["section_id"] == 6
    assert body["course_code"] == "BIOL 1301"
    assert body["status"] == "Pending"
    assert body["signup_date"] == _campus_today().isoformat()
    assert body["in_observer_pool"] is True


def test_signup_defaults_to_current_cycle(client):
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert response.status_code == 201
    assert response.json()["cycle_id"] == 2


def test_second_signup_same_cycle_is_rejected(client):
    response = client.post("/api/signups", json={"professor_id": 1, "section_id": 4})
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert "Limit is 1 per cycle" in detail["message"]
    assert detail["existing_signup"]["section_id"] == 1


def test_signing_up_twice_for_same_section_is_rejected(client):
    first = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert first.status_code == 201
    second = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert second.status_code == 409


def test_rejected_signup_does_not_create_a_row(client):
    client.post("/api/signups", json={"professor_id": 1, "section_id": 4})
    response = client.get("/api/observees/1/signup")
    assert response.status_code == 200
    assert response.json()["section_id"] == 1


def test_signup_for_section_not_taught_is_rejected(client):
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 1})
    assert response.status_code == 400
    assert "section they teach" in response.json()["detail"]


def test_signup_unknown_professor(client):
    response = client.post("/api/signups", json={"professor_id": 999, "section_id": 6})
    assert response.status_code == 404


def test_signup_unknown_section(client):
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 999})
    assert response.status_code == 404


def test_signup_unknown_cycle(client):
    response = client.post(
        "/api/signups", json={"professor_id": 5, "section_id": 6, "cycle_id": 999}
    )
    assert response.status_code == 404


def test_signup_section_outside_cycle_term_is_rejected(client):
    response = client.post(
        "/api/signups", json={"professor_id": 5, "section_id": 6, "cycle_id": 1}
    )
    assert response.status_code == 400
    assert "Spring 2026" in response.json()["detail"]


def test_signup_after_deadline_is_rejected(client, monkeypatch):
    after_deadline = _campus_today() + timedelta(days=31)
    monkeypatch.setattr(observee_signup, "_today", lambda: after_deadline)
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert response.status_code == 400
    assert "signup deadline" in response.json()["detail"]


def test_get_observee_signup(client):
    response = client.get("/api/observees/1/signup")
    assert response.status_code == 200
    assert response.json()["signup_id"] == 1


def test_get_observee_signup_none_yet(client):
    response = client.get("/api/observees/5/signup")
    assert response.status_code == 404


def test_observer_pool_lists_signed_up_professors(client):
    assert sorted(_pool_ids(client)) == [1, 2, 3, 4]


def test_signup_adds_professor_to_observer_pool(client):
    assert 5 not in _pool_ids(client)
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert response.status_code == 201
    assert 5 in _pool_ids(client)


def test_professor_not_signed_up_is_not_in_pool(client):
    assert 6 not in _pool_ids(client)


def test_observer_pool_includes_department_and_course_levels(client):
    response = client.get("/api/observer-pool")
    observers = {o["professor_id"]: o for o in response.json()["observers"]}
    alice = observers[1]
    assert alice["department_name"] == "Computer Science"
    assert alice["course_levels"] == [1000, 3000]


def test_observer_pool_for_other_cycle_is_separate(client):
    assert _pool_ids(client, cycle_id=1) == []
