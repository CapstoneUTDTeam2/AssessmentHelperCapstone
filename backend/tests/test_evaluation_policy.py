"""Evaluation policy: the committee can change it, but never for a cycle that has started."""

import psycopg

from tests.conftest import TEST_DATABASE_URL, _raw_conninfo

NEW_POLICY = {
    "assistant_frequency_years": 2,
    "senior_frequency_years": 3,
    "signups_per_cycle": 2,
    "max_observers": 3,
}


def _sql(statement):
    with psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True) as conn:
        conn.execute(statement)


def _add_next_cycle():
    _sql(
        """
        INSERT INTO EvaluationCycle (CycleID, TermID, SignUpDeadLine, ObservationDeadLine,
                                     PostObservationFeedbackDeadLine, AppFeedbackDeadLine)
        SELECT 3, TermID, '2027-01-30', '2027-04-15', '2027-05-01', '2027-05-01'
        FROM AcademicTerm WHERE Semester = 'Spring' AND YearNum = 2027
        """
    )


def _alice_frequency(client):
    # Alice (1) is an Assistant Professor in the sample data.
    return client.get("/api/evaluation-status/1").json()["frequency_years"]


def test_defaults_match_the_process(client):
    body = client.get("/api/evaluation-policy").json()
    assert body["current"]["policy"] == {
        "assistant_frequency_years": 1,
        "senior_frequency_years": 2,
        "signups_per_cycle": 1,
        "max_observers": 5,
        "is_default": True,
    }


def test_started_cycle_changes_go_to_next_cycle(client):
    # Sample data has signups in the current cycle, so it has started.
    _add_next_cycle()
    body = client.get("/api/evaluation-policy").json()
    assert body["current"]["started"] is True
    assert body["editable"]["cycle_id"] == 3

    saved = client.put("/api/evaluation-policy", json=NEW_POLICY)
    assert saved.status_code == 200
    after = saved.json()
    assert after["editable"]["policy"]["senior_frequency_years"] == 3
    # The running cycle keeps its rules.
    assert after["current"]["policy"]["senior_frequency_years"] == 2
    assert after["current"]["policy"]["is_default"] is True
    assert _alice_frequency(client) == 1


def test_no_next_cycle_means_nothing_to_change(client):
    body = client.get("/api/evaluation-policy").json()
    assert body["editable"] is None
    response = client.put("/api/evaluation-policy", json=NEW_POLICY)
    assert response.status_code == 400


def test_cycle_before_signups_takes_the_change_now(client):
    # Clearing this cycle's signups puts it back before its start.
    assert client.post("/api/test/randomize-unknowns").status_code == 200
    body = client.get("/api/evaluation-policy").json()
    assert body["current"]["started"] is False
    assert body["editable"]["cycle_id"] == body["current"]["cycle_id"]

    saved = client.put("/api/evaluation-policy", json=NEW_POLICY).json()
    assert saved["current"]["policy"]["assistant_frequency_years"] == 2
    assert saved["current"]["policy"]["max_observers"] == 3
    # Randomize may give Alice a new rank, so check against whichever rank she has now.
    alice = client.get("/api/evaluation-status/1").json()
    expected = 2 if alice["current_level"] == "Assistant Professor" else 3
    assert alice["frequency_years"] == expected

    from app.api.evaluation_policy import max_observers, signups_per_cycle
    from app.db import engine

    with engine.connect() as conn:
        cycle_id = body["current"]["cycle_id"]
        assert max_observers(conn, cycle_id) == 3
        assert signups_per_cycle(conn, cycle_id) == 2


def test_later_cycles_inherit_until_changed(client):
    assert client.post("/api/test/randomize-unknowns").status_code == 200
    client.put("/api/evaluation-policy", json=NEW_POLICY)
    _add_next_cycle()
    from app.api.evaluation_policy import get_policy
    from app.db import engine

    with engine.connect() as conn:
        assert get_policy(conn, 3)["senior_frequency_years"] == 3


def test_rejects_out_of_range_values(client):
    _add_next_cycle()
    for field, bad in (("assistant_frequency_years", 0), ("senior_frequency_years", 6), ("max_observers", 11)):
        response = client.put("/api/evaluation-policy", json={**NEW_POLICY, field: bad})
        assert response.status_code == 422
