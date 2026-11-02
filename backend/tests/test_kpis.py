"""AHC-300 to AHC-306 KPIs, AHC-307 executive dashboard, AHC-308 unmatched faculty report."""

from datetime import timedelta

import psycopg
import pytest

from app.api import cycle_deadlines, observer_selection
from tests.conftest import TEST_DATABASE_URL, _raw_conninfo


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


def _today():
    return cycle_deadlines.campus_now().date()


@pytest.fixture
def lists_saved(client, monkeypatch, fresh_signups):
    monkeypatch.setattr(observer_selection, "_today", lambda: _today() + timedelta(days=31))
    client.post("/api/observer-selection/start")
    return fresh_signups


def _kpis(client):
    response = client.get("/api/kpis")
    assert response.status_code == 200
    return response.json()


def test_eligibility_accuracy_all_correct(client, lists_saved):
    accuracy = _kpis(client)["evaluation_eligibility_accuracy"]
    assert accuracy["total_matches"] == 2
    assert accuracy["percent"] == 100.0
    assert accuracy["incorrect"] == []


def test_eligibility_accuracy_catches_each_kind_of_bad_match(client, lists_saved):
    with _db() as conn:
        # Professor 300: Computer Science, taught CS 4347 last fall, but teaches during Carol's class now.
        conn.execute("INSERT INTO Professors VALUES (300, 'Busy Observer', 1, 'Assistant Professor', 1)")
        conn.execute("INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (9, 300)")
        conn.execute("INSERT INTO Sections VALUES (41, '003', 1, 5, 'MW', '13:30', '14:45')")
        conn.execute("INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (41, 300)")
        conn.execute(
            "INSERT INTO SignupObserverList (SignupID, ObserverProfessorID) VALUES (3, 3), (3, 2), (3, 5), (3, 300)"
        )
    accuracy = _kpis(client)["evaluation_eligibility_accuracy"]
    assert accuracy["total_matches"] == 6
    assert accuracy["correct_matches"] == 2
    assert accuracy["percent"] == pytest.approx(33.3)
    reasons = {i["observer_id"]: i["reasons"] for i in accuracy["incorrect"]}
    assert "same professor" in reasons[3]
    assert reasons[2] == ["different course level"]  # Robert teaches 1000 and 2000 level
    assert "different department" in reasons[5]
    assert reasons[300] == ["teaching during the class time"]


def test_no_matches_means_no_accuracy_yet(client, fresh_signups):
    assert _kpis(client)["evaluation_eligibility_accuracy"]["percent"] is None


def test_overdue_matches_the_status_view(client):
    statuses = client.get("/api/evaluation-status").json()["professors"]
    overdue = sum(1 for p in statuses if p["status"] == "Overdue")
    assert _kpis(client)["overdue_evaluation_count"]["count"] == overdue


@pytest.fixture
def carol_due(client):
    """Carol (3): evaluated last fall in cycle 1, so Due now, with observation 3 not finished."""
    with _db() as conn:
        # Past records would trip the live deadline triggers, so load them with triggers off.
        conn.execute("SET session_replication_role = replica")
        conn.execute("UPDATE Professors SET CurrentLevel = 'Assistant Professor', StartTermID = 1 WHERE ProfessorID = 3")
        conn.execute(
            "INSERT INTO ObservationSignup (SignupID, CycleID, ObserveeProfessorID, SectionID, Status) "
            "VALUES (90, 1, 3, 9, 'Accepted')"
        )
        conn.execute(
            "INSERT INTO Observation (ObservationID, SignupID, ObservationDate, ObserverProfessorID, TemplateID, "
            "ScheduledDate, ScheduledTime, CompletedDate, CompletedTime, Status, Signee, Observer, ObserveeID, ObservationTime) "
            "VALUES (90, 90, '2025-10-14', 1, 2, '2025-10-14', '09:00', '2025-10-14', '10:15', 'Completed', "
            "'Carol Williams', 'Alice Johnson', 3, '09:00')"
        )


def _status(table_sql):
    with _db() as conn:
        return conn.execute(f"SELECT EvaluationStatus FROM {table_sql} WHERE ProfessorID = 3").fetchone()[0]


def test_finishing_an_observation_does_not_change_participation(client, carol_due):
    before = _kpis(client)["assessment_participation_rate"]
    assert _status("ProfessorEvaluationStatus") == "Due"
    with _db() as conn:
        conn.execute("SET session_replication_role = replica")
        conn.execute("UPDATE Observation SET Status = 'Completed', CompletedDate = %s WHERE ObservationID = 3", (_today(),))
    assert _status("ProfessorEvaluationStatus") == "Not Due"
    assert _status("professor_evaluation_status(2)") == "Due"
    assert _kpis(client)["assessment_participation_rate"] == before


def test_participation_only_counts_signups_from_professors_who_were_due(client, carol_due):
    before = _kpis(client)
    with _db() as conn:
        conn.execute("UPDATE Professors SET CurrentLevel = NULL WHERE ProfessorID = 3")
    after = _kpis(client)
    assert after["assessment_participation_rate"]["signed_up"] == before["assessment_participation_rate"]["signed_up"] - 1
    assert after["assessment_participation_rate"]["due"] == before["assessment_participation_rate"]["due"] - 1
    assert after["observer_utilization_rate"]["signed_up"] == before["observer_utilization_rate"]["signed_up"]


def test_rate_and_level_math():
    from app.api.kpis import _level_counts, _rate

    assert _rate(3, 4) == 75.0
    assert _rate(1, 3) == 33.3
    assert _rate(5, 0) is None
    rows = [
        {"status": "Due", "level": "Assistant Professor", "n": 2},
        {"status": "Overdue", "level": "Assistant Professor", "n": 1},
        {"status": "Overdue", "level": None, "n": 1},
        {"status": "Not Due", "level": "Full Professor", "n": 4},
    ]
    assert _level_counts(rows, ("Due", "Overdue")) == {"Assistant Professor": 3, "Unknown": 1}
    assert _level_counts(rows, ("Overdue",)) == {"Assistant Professor": 1, "Unknown": 1}


def test_observer_utilization(client):
    utilization = _kpis(client)["observer_utilization_rate"]
    # Sample: Robert, Carol, Alice, and Grace each have an observation as observer; four professors signed up.
    assert utilization == {"observers": 4, "signed_up": 4, "percent": 100.0}


def test_list_sufficiency(client, lists_saved):
    sufficiency = _kpis(client)["list_sufficiency_rate"]
    assert sufficiency["saved_matches"] == 2
    assert sufficiency["signups"] == 4
    assert sufficiency["average_list_size"] == 0.5
    assert sufficiency["percent_of_full_list"] == 10.0


def test_missing_observation_count(client):
    with _db() as conn:
        # The sample dates pass as real time goes by, so start with both still upcoming.
        conn.execute(
            "UPDATE Observation SET ScheduledDate = %s, ObservationDate = %s WHERE ObservationID IN (3, 4)",
            (_today() + timedelta(days=2), _today() + timedelta(days=2)),
        )
    assert _kpis(client)["missing_observation_count"]["count"] == 0
    with _db() as conn:
        conn.execute(
            "UPDATE Observation SET ScheduledDate = %s, ObservationDate = %s WHERE ObservationID = 3",
            (_today() - timedelta(days=2), _today() - timedelta(days=2)),
        )
    missing = _kpis(client)["missing_observation_count"]
    assert missing["count"] == 1
    assert missing["observations"][0]["observation_id"] == 3
    assert missing["observations"][0]["observee"] == "Carol Williams"


def test_survey_completion_rate(client):
    completion = _kpis(client)["survey_completion_rate"]
    # Alice and Robert signed up, sent a request, had it accepted, were observed, and took the observee survey.
    assert completion["completed_full_process"] == 2
    assert completion["signups"] == 4
    assert completion["percent"] == 50.0


def test_unmatched_faculty_reasons(client, lists_saved):
    # Emily signs up (nobody in Biology can observe her); David's request gets declined.
    with _db() as conn:
        conn.execute("UPDATE ObservationSignup SET Status = 'Requests Sent' WHERE SignupID = 4")
        conn.execute(
            "INSERT INTO ObserverRequest (RequestID, SignupID, ObserverProfessorID, Status) VALUES (50, 4, 7, 'Declined')"
        )
    assert client.post("/api/signups", json={"professor_id": 5, "section_id": 6}).status_code == 201
    report = client.get("/api/reports/unmatched-faculty").json()
    reasons = {f["professor_name"]: f["reason"] for f in report["faculty"]}
    assert reasons == {
        "Carol Williams": "No requests sent yet",
        "David Brown": "Every request was declined or expired",
        "Emily Davis": "No eligible observers",
    }
    assert report["count"] == 3


def test_unmatched_excludes_signups_with_an_observer(client):
    # In the sample data every signup already has an observation.
    assert client.get("/api/reports/unmatched-faculty").json()["count"] == 0


def test_executive_dashboard(client):
    body = client.get("/api/dashboard/executive").json()
    # Observations 3 (Carol, Full Professor) and 4 (David, Assistant Professor) aren't completed.
    assert body["outstanding_reports_by_hire_level"] == {"Full Professor": 1, "Assistant Professor": 1}
    statuses = client.get("/api/evaluation-status").json()["professors"]
    due_levels = {}
    for p in statuses:
        if p["status"] in ("Due", "Overdue"):
            due_levels[p["current_level"] or "Unknown"] = due_levels.get(p["current_level"] or "Unknown", 0) + 1
    assert body["faculty_due_by_hire_level"] == due_levels
    assert body["unmatched_faculty_count"] == 0


def test_eligibility_accuracy_with_named_days_on_different_days(client, lists_saved):
    with _db() as conn:
        conn.execute("UPDATE Sections SET MeetingDays = 'Monday,Wednesday' WHERE SectionID = 3")
        conn.execute("UPDATE Sections SET MeetingDays = 'Tuesday,Thursday' WHERE SectionID <> 3 AND MeetingDays IN ('MW', 'TR')")
    assert _kpis(client)["evaluation_eligibility_accuracy"]["percent"] == 100.0


def test_eligibility_accuracy_catches_named_day_conflict(client, lists_saved):
    with _db() as conn:
        observer = conn.execute("SELECT ObserverProfessorID FROM SignupObserverList WHERE SignupID = 3").fetchone()[0]
        conn.execute("UPDATE Sections SET MeetingDays = 'Monday,Wednesday' WHERE SectionID = 3")
        conn.execute("INSERT INTO Sections VALUES (42, '004', 1, 5, 'Monday,Friday', '13:30', '14:45')")
        conn.execute("INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (42, %s)", (observer,))
    accuracy = _kpis(client)["evaluation_eligibility_accuracy"]
    assert [i["reasons"] for i in accuracy["incorrect"]] == [["teaching during the class time"]]


def test_not_held_counts_as_missing_right_away(client):
    with _db() as conn:
        conn.execute(
            "UPDATE Observation SET ScheduledDate = %s, ObservationDate = %s WHERE ObservationID IN (3, 4)",
            (_today() + timedelta(days=2), _today() + timedelta(days=2)),
        )
    assert _kpis(client)["missing_observation_count"]["count"] == 0
    client.post("/api/observations/3/not-held", json={"observee_id": 3, "reason": "Class was cancelled."})
    missing = _kpis(client)["missing_observation_count"]
    assert missing["count"] == 1
    assert missing["observations"][0]["status"] == "Not Held"
    assert missing["observations"][0]["reason"] == "Class was cancelled."


def test_not_held_is_not_an_outstanding_report(client):
    before = client.get("/api/dashboard/executive").json()["outstanding_reports_by_hire_level"]
    client.post("/api/observations/3/not-held", json={"observee_id": 3, "reason": "Class was cancelled."})
    after = client.get("/api/dashboard/executive").json()["outstanding_reports_by_hire_level"]
    assert sum(after.values()) == sum(before.values()) - 1


def test_not_held_does_not_count_as_evaluated(client, carol_due):
    client.post("/api/observations/3/not-held", json={"observee_id": 3, "reason": "Class was cancelled."})
    assert _status("ProfessorEvaluationStatus") == "Due"
