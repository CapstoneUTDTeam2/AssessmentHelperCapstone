"""AHC-354: course catalog and teaching history. Current-semester /classes already exists."""


def test_current_semester_classes_unchanged(client):
    response = client.get("/api/observees/1/classes")
    assert response.status_code == 200
    body = response.json()
    assert (body["semester"], body["year"]) == ("Fall", 2026)
    codes = [item["course_code"] for item in body["classes"]]
    assert codes == ["CS 1337", "CS 3354"]


def test_catalog_lists_courses_with_description_and_sections(client):
    response = client.get("/api/courses")
    assert response.status_code == 200
    body = response.json()
    assert (body["semester"], body["year"]) == ("Fall", 2026)
    by_code = {course["course_code"]: course for course in body["courses"]}
    assert set(by_code) == {
        "CS 1337",
        "CS 2336",
        "CS 4347",
        "CS 3354",
        "MATH 2413",
        "BIOL 1301",
    }
    cs1337 = by_code["CS 1337"]
    assert "programming" in cs1337["course_description"].lower()
    assert cs1337["sections"][0]["section_name"] == "001"
    assert cs1337["sections"][0]["meeting_days"] == "MW"
    assert cs1337["sections"][0]["instructors"][0]["professor_name"] == "Alice Johnson"


def test_one_course(client):
    response = client.get("/api/courses/1")
    assert response.status_code == 200
    body = response.json()
    assert body["course_code"] == "CS 1337"
    assert body["sections"]


def test_unknown_course(client):
    response = client.get("/api/courses/999")
    assert response.status_code == 404


def test_teaching_history_groups_current_term(client):
    response = client.get("/api/observees/1/teaching-history")
    assert response.status_code == 200
    body = response.json()
    assert body["professor_id"] == 1
    # Sample data also has Alice teaching CS 4347 in Fall 2025, listed after the current term.
    assert len(body["terms"]) == 2
    assert (body["terms"][1]["semester"], body["terms"][1]["year"], body["terms"][1]["courses"]) == ("Fall", 2025, ["CS 4347"])
    term = body["terms"][0]
    assert (term["semester"], term["year"]) == ("Fall", 2026)
    assert term["courses"] == ["CS 1337", "CS 3354"]
    assert term["sections"] == 2
    assert [item["course_code"] for item in term["classes"]] == ["CS 1337", "CS 3354"]


def test_teaching_history_empty_when_no_assignments(client):
    response = client.get("/api/observees/6/teaching-history")
    assert response.status_code == 200
    assert response.json()["terms"] == []


def test_teaching_history_unknown_professor(client):
    response = client.get("/api/observees/999/teaching-history")
    assert response.status_code == 404
