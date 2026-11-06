"""The current cycle follows the campus date, so semesters added ahead don't take over early."""

import psycopg
import pytest

from tests.conftest import TEST_DATABASE_URL, _raw_conninfo

# The seed's future cycles; the shared fixture removes them to keep other tests on cycle 2.
FUTURE_CYCLES = """
INSERT INTO EvaluationCycle (CycleID, TermID, SignUpDeadLine, ObservationDeadLine,
    PostObservationFeedbackDeadLine, AppFeedbackDeadLine, TemplateID)
VALUES
(3, 6, '2027-01-30', '2027-04-15', '2027-05-01', '2027-05-15', 3),
(4, 7, '2027-09-15', '2027-11-15', '2027-12-15', '2027-12-15', 3),
(5, 8, '2028-01-30', '2028-04-15', '2028-05-01', '2028-05-15', 3),
(6, 9, '2028-09-15', '2028-11-15', '2028-12-15', '2028-12-15', 3)
"""


@pytest.fixture
def clock(client):
    with psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True) as conn:
        conn.execute(FUTURE_CYCLES)

    def set_date(on_date):
        response = client.put("/api/test/clock", json={"frozen_at": f"{on_date}T10:00:00"})
        assert response.status_code == 200

    yield set_date
    client.put("/api/test/clock", json={"frozen_at": None})


def _current(client):
    body = client.get("/api/evaluation-cycles/current").json()
    return body["cycle_id"], f"{body['semester']} {body['year']}"


@pytest.mark.parametrize(
    "on_date, expected",
    [
        ("2026-03-01", (1, "Spring 2026")),
        # Spring stays current through the summer, so its final KPIs show.
        ("2026-07-31", (1, "Spring 2026")),
        ("2026-08-01", (2, "Fall 2026")),
        ("2026-12-31", (2, "Fall 2026")),
        ("2027-01-01", (3, "Spring 2027")),
        ("2027-10-01", (4, "Fall 2027")),
        ("2028-11-01", (6, "Fall 2028")),
        ("2029-06-01", (6, "Fall 2028")),
        # Before any cycle has started, the earliest.
        ("2025-01-01", (1, "Spring 2026")),
    ],
)
def test_current_cycle_follows_the_date(client, clock, on_date, expected):
    clock(on_date)
    assert _current(client) == expected


def test_status_view_uses_the_current_cycle(client, clock):
    clock("2027-10-01")
    body = client.get("/api/evaluation-status").json()
    assert (body["current_term"]["semester"], body["current_term"]["year"]) == ("Fall", 2027)


def test_seed_has_semesters_two_years_ahead(client):
    terms = {(t["semester"], t["year"]) for t in client.get("/api/test/harness").json()["terms"]}
    assert {("Spring", 2027), ("Fall", 2027), ("Spring", 2028), ("Fall", 2028)} <= terms
