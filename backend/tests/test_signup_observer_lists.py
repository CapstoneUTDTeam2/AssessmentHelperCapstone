"""AHC-245: generate up to five eligible observers for each signup."""


def test_one_signup_returns_at_most_five(client):
    response = client.get("/api/signups/1/eligible-observers")
    assert response.status_code == 200
    body = response.json()
    assert body["signup_id"] == 1
    assert body["faculty_id"] == 1
    assert len(body["observers"]) <= 5


def test_unknown_signup(client):
    response = client.get("/api/signups/999/eligible-observers")
    assert response.status_code == 404


def test_generate_for_every_signup_in_cycle(client):
    response = client.post("/api/match-observers/signups")
    assert response.status_code == 200
    body = response.json()
    assert body["cycle_id"] == 2
    assert body["signup_count"] == 4
    assert {item["signup_id"] for item in body["signups"]} == {1, 2, 3, 4}
    for item in body["signups"]:
        assert len(item["observers"]) <= 5
        assert item["faculty_id"] not in [
            observer["observer_id"] for observer in item["observers"]
        ]


def test_due_matches_include_due_faculty(client):
    response = client.get("/api/due-matches")
    assert response.status_code == 200
    body = response.json()
    assert body["cycle_id"] == 2
    assert body["assumed_due_signups"] is True
    due_ids = {item["faculty_id"] for item in body["faculty"]}
    for item in body["faculty"]:
        assert item["evaluation_status"] == "Due"
        observer_ids = [observer["observer_id"] for observer in item["observers"]]
        assert len(observer_ids) <= 5
        assert item["faculty_id"] not in observer_ids
        assert set(observer_ids) <= due_ids


def test_other_cycle_has_no_signups(client):
    response = client.post("/api/match-observers/signups", params={"cycle_id": 1})
    assert response.status_code == 200
    assert response.json()["signup_count"] == 0


def test_new_signup_includes_observer_list(client):
    response = client.post("/api/signups", json={"professor_id": 5, "section_id": 6})
    assert response.status_code == 201
    body = response.json()
    assert "observers" in body
    assert body["insufficient"] is True
    assert body["observers"] == []


def test_get_signup_includes_observer_list(client):
    response = client.get("/api/observees/1/signup")
    assert response.status_code == 200
    assert "observers" in response.json()
