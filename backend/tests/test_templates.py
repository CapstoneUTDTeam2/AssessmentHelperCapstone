"""AHC-280: committee manages observation templates and criteria."""

import psycopg
import pytest

from tests.conftest import TEST_DATABASE_URL, _raw_conninfo


def _db():
    return psycopg.connect(_raw_conninfo(TEST_DATABASE_URL), autocommit=True)


# Sample data: template 1 (cycle 1) is unlocked, template 2 (cycle 2) is locked because
# observations 1 and 2 were completed with it.


def test_list_templates(client):
    templates = {t["template_id"]: t for t in client.get("/api/templates").json()["templates"]}
    assert templates[1]["is_locked"] is False
    assert templates[2]["is_locked"] is True
    assert templates[2]["cycle_ids"] == [2]
    assert templates[2]["observation_count"] == 4


def test_current_cycle_template(client):
    body = client.get("/api/templates/current").json()
    assert body["cycle_id"] == 2
    assert body["template_id"] == 2
    assert [c["name"] for c in body["criteria"]] == ["Organization", "Clarity", "Student Interaction"]
    assert [r["value"] for r in body["rating_scale"]] == [5, 4, 3, 2, 1, 6]
    organization = body["criteria"][0]
    assert organization["used_in"] == 2
    assert organization["applies_to"] == "All"


def test_get_template_unknown(client):
    assert client.get("/api/templates/999").status_code == 404


def test_locked_template_cannot_change(client):
    add = client.post("/api/templates/2/criteria", json={"name": "Pacing"})
    assert add.status_code == 409
    assert "locked" in add.json()["detail"]
    assert client.put("/api/criteria/4", json={"name": "Structure"}).status_code == 409
    assert client.delete("/api/criteria/4").status_code == 409
    assert client.put("/api/templates/2", json={"version": "2.1"}).status_code == 409


def test_add_edit_delete_criterion(client):
    created = client.post(
        "/api/templates/1/criteria",
        json={
            "name": "  Pacing  ",
            "description": "Class moves at a good speed.",
            "guidance": "Look at how long each topic takes.",
            "applies_to": "In person",
            "bullets": ["Covers planned material", "Leaves time for questions"],
        },
    )
    assert created.status_code == 201
    criterion = created.json()
    assert criterion["name"] == "Pacing"
    assert criterion["bullets"] == ["Covers planned material", "Leaves time for questions"]
    assert criterion["display_order"] == 1
    cid = criterion["criterion_id"]

    updated = client.put(f"/api/criteria/{cid}", json={"is_required": False, "bullets": ["Only one point"]})
    assert updated.status_code == 200
    body = updated.json()
    assert body["is_required"] is False
    assert body["name"] == "Pacing"  # untouched
    assert body["description"] == "Class moves at a good speed."
    assert body["bullets"] == ["Only one point"]

    cleared = client.put(f"/api/criteria/{cid}", json={"description": None})
    assert cleared.json()["description"] is None

    deleted = client.delete(f"/api/criteria/{cid}")
    assert deleted.status_code == 200
    assert cid not in [c["criterion_id"] for c in deleted.json()["criteria"]]


@pytest.mark.parametrize(
    "payload, message",
    [
        ({"name": "   "}, "can't be empty"),
        ({"name": "x" * 101}, "100 characters"),
        ({"name": "Pacing", "applies_to": "Everywhere"}, "applies_to must be one of"),
        ({"name": "Pacing", "bullets": ["ok", " "]}, "Bullet points can't be empty"),
    ],
)
def test_bad_criterion_rejected(client, payload, message):
    response = client.post("/api/templates/1/criteria", json=payload)
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_unknown_criterion(client):
    assert client.put("/api/criteria/999", json={"name": "x"}).status_code == 404
    assert client.delete("/api/criteria/999").status_code == 404


def test_new_version_copies_and_old_stays(client):
    response = client.post("/api/templates/2/versions", json={"version": "3.0"})
    assert response.status_code == 201
    new = response.json()
    assert new["is_locked"] is False
    assert new["version"] == "3.0"
    assert [c["name"] for c in new["criteria"]] == ["Organization", "Clarity", "Student Interaction"]
    assert all(c["used_in"] == 0 for c in new["criteria"])
    old_ids = {4, 5, 6}
    assert not old_ids & {c["criterion_id"] for c in new["criteria"]}

    # The copy can be edited; the original is unchanged.
    first = new["criteria"][0]["criterion_id"]
    assert client.put(f"/api/criteria/{first}", json={"name": "Structure"}).status_code == 200
    assert client.get("/api/templates/2").json()["criteria"][0]["name"] == "Organization"


def test_new_version_copies_sections_and_bullets(client):
    section = client.post("/api/templates/1/sections", json={"name": "Course Setup"}).json()["sections"][0]
    client.post(
        "/api/templates/1/criteria",
        json={"name": "Syllabus", "section_id": section["section_id"], "bullets": ["Posted on time"]},
    )
    new = client.post("/api/templates/1/versions", json={"version": "1.1"}).json()
    assert [s["name"] for s in new["sections"]] == ["Course Setup"]
    syllabus = next(c for c in new["criteria"] if c["name"] == "Syllabus")
    assert syllabus["section_id"] == new["sections"][0]["section_id"]
    assert syllabus["section_id"] != section["section_id"]
    assert syllabus["bullets"] == ["Posted on time"]


def test_version_name_required(client):
    assert client.post("/api/templates/2/versions", json={"version": " "}).status_code == 400


def test_sections(client):
    first = client.post("/api/templates/1/sections", json={"name": "Engagement"})
    assert first.status_code == 201
    section_id = first.json()["sections"][0]["section_id"]
    assert client.post("/api/templates/1/sections", json={"name": "Other", "display_order": 1}).status_code == 409
    renamed = client.put(f"/api/sections/{section_id}", json={"name": "Engagement & Communication"})
    assert renamed.json()["sections"][0]["name"] == "Engagement & Communication"

    client.post("/api/templates/1/criteria", json={"name": "Asks questions", "section_id": section_id})
    blocked = client.delete(f"/api/sections/{section_id}")
    assert blocked.status_code == 409

    other_template_section = client.post("/api/templates/1/versions", json={"version": "x"}).json()["sections"][0]
    wrong = client.post(
        "/api/templates/1/criteria", json={"name": "Wrong", "section_id": other_template_section["section_id"]}
    )
    assert wrong.status_code == 400


def test_delete_empty_section(client):
    section_id = client.post("/api/templates/1/sections", json={"name": "Empty"}).json()["sections"][0]["section_id"]
    assert client.delete(f"/api/sections/{section_id}").json()["sections"] == []
    assert client.delete(f"/api/sections/{section_id}").status_code == 404


def test_rated_criterion_cannot_be_deleted(client):
    # Cycle 1 has no observations, so give it a fresh unlocked template and one scheduled
    # (not completed) observation with a rating.
    new = client.post("/api/templates/1/versions", json={"version": "1.1"}).json()
    criterion = new["criteria"][0]["criterion_id"]
    with _db() as conn:
        conn.execute("UPDATE EvaluationCycle SET TemplateID = %s WHERE CycleID = 1", (new["template_id"],))
        # Carol teaches section 8 in cycle 1's term.
        conn.execute("INSERT INTO ObservationSignup VALUES (90, 1, 3, 8, NULL, NULL, 'Accepted')")
        conn.execute("ALTER TABLE ObserverRequest DISABLE TRIGGER validate_observer_qualification")
        try:
            conn.execute(
                "INSERT INTO ObserverRequest (RequestID, SignupID, ObserverProfessorID, Status) VALUES (90, 90, 1, 'Accepted')"
            )
        finally:
            conn.execute("ALTER TABLE ObserverRequest ENABLE TRIGGER validate_observer_qualification")
        conn.execute(
            "INSERT INTO Observation (ObservationID, SignupID, ObserverProfessorID, TemplateID, Status, ObserveeID) "
            "VALUES (90, 90, 1, %s, 'Scheduled', 3)",
            (new["template_id"],),
        )
        conn.execute(
            "INSERT INTO ObservationCriterionRating VALUES (90, %s, %s, 4, 'Good')", (criterion, new["template_id"])
        )
    response = client.delete(f"/api/criteria/{criterion}")
    assert response.status_code == 409
    assert "Mark it inactive instead" in response.json()["detail"]
    assert client.put(f"/api/criteria/{criterion}", json={"is_active": False}).json()["is_active"] is False


def test_cycle_template_switch(client):
    new = client.post("/api/templates/1/versions", json={"version": "1.1"}).json()
    # Cycle 1 has no observations, so its template can change.
    ok = client.put("/api/evaluation-cycles/1/template", json={"template_id": new["template_id"]})
    assert ok.status_code == 200
    assert client.get("/api/templates/current", params={"cycle_id": 1}).json()["template_id"] == new["template_id"]
    # Cycle 2 already has observations, so the database blocks it.
    blocked = client.put("/api/evaluation-cycles/2/template", json={"template_id": new["template_id"]})
    assert blocked.status_code == 409
    assert "existing observations" in blocked.json()["detail"]
    assert client.put("/api/evaluation-cycles/2/template", json={"template_id": 999}).status_code == 404
