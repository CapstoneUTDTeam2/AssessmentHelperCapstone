"""Import Nebula Labs CourseBook data into the Assessment Helper schema.

Only source-backed Department, AcademicTerm, Courses, Sections, Professors, and
TeachingAssignment rows are written.  Workflow data remains application-owned.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import hmac
import os
import re
import sys
import threading
import time
from dataclasses import dataclass
from datetime import time as dt_time
from pathlib import Path
from typing import Any, Iterable

import requests
from dotenv import dotenv_values

API_URL = "https://api.utdnebula.com"
PAGE_SIZE = 20
SEMESTER_NUMBER = {"spring": 1, "summer": 2, "fall": 3}


class IngestionError(RuntimeError):
    """Raised when source data cannot be imported safely."""


def stable_int(namespace: str, value: str) -> int:
    """Return a deterministic positive PostgreSQL INTEGER for a source key."""
    digest = hashlib.sha256(f"{namespace}:{value}".encode()).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF or 1


def pseudonym(source_id: str, key: str) -> str:
    """Produce a stable, non-name-derived replacement identity."""
    token = hmac.new(key.encode(), source_id.encode(), hashlib.sha256).hexdigest()[:12]
    return f"Professor {token}"

THEATRE_NAMES = [
    # Les Misérables
    "Jean Valjean", "Javert", "Fantine", "Cosette", "Marius Pontmercy",
    "Eponine Thenardier", "Enjolras", "Grantaire", "Gavroche",
    "Monsieur Thenardier", "Madame Thenardier", "Bishop Myriel",
    "Felix Tholomyes", "Jean Prouvaire", "Combeferre", "Courfeyrac",
    "Feuilly", "Bahorel", "Bossuet", "Joly", "Azelma Thenardier",
    "Gillenormand", "Mabeuf", "Montparnasse", "Babet", "Claquesous",
    "Brujon", "Fauchelevent", "Champmathieu", "Sister Simplice",
    "Sister Perpetue", "Brevet", "Chenildieu", "Cochepaille",
    "Toussaint", "Madame Magloire",

    # Hadestown
    "Orpheus", "Eurydice", "Hermes", "Persephone",
    "Hades", "Fate One", "Fate Two", "Fate Three",

    # Chicago
    "Roxie Hart", "Velma Kelly", "Billy Flynn", "Amos Hart",
    "Matron Morton", "Mary Sunshine", "Fred Casely", "Harrison",
    "Liz", "Annie", "June", "Hunyak",

    # Little Shop of Horrors
    "Seymour Krelborn", "Audrey", "Audrey Two", "Mr Mushnik",
    "Orin Scrivello", "Crystal", "Ronnette", "Chiffon",
    "Patrick Martin", "Bernstein",

    # Hamilton
    "Alexander Hamilton", "Aaron Burr", "Eliza Schuyler",
    "Angelica Schuyler", "Peggy Schuyler", "George Washington",
    "Thomas Jefferson", "James Madison", "John Laurens",
    "Hercules Mulligan", "Philip Hamilton", "Maria Reynolds",
    "James Reynolds", "Samuel Seabury", "Charles Lee",
    "King George III", "George Eacker", "Philip Schuyler",

    # The Phantom of the Opera
    "Erik", "Christine Daae", "Raoul de Chagny",
    "Carlotta Giudicelli", "Madame Giry", "Meg Giry",
    "Ubaldo Piangi", "Richard Firmin", "Gilles Andre",
    "Joseph Buquet", "Monsieur Reyer", "Madame Valerius",

    # The Book of Mormon
    "Kevin Price", "Arnold Cunningham", "Nabulungi",
    "Elder McKinley", "Elder Thomas", "Elder Davis",
    "Elder Church", "Elder Grant", "Elder Michaels",
    "Mission President",

    # South Park: Bigger, Longer & Uncut
    "Stan Marsh", "Kyle Broflovski", "Eric Cartman",
    "Kenny McCormick", "Wendy Testaburger", "Chef",
    "Mr Garrison", "Mr Mackey", "Sheila Broflovski",
    "Gerald Broflovski", "Sharon Marsh", "Randy Marsh",
    "Liane Cartman", "Ike Broflovski", "Terrance",
    "Phillip", "Butters Stotch", "Craig Tucker",
    "Clyde Donovan", "Gregory",
]
def fictional_professor_name(source_id: str, key: str, used_names: set) -> str:
    """Generate a fictional name, resolving collisions by moving forward."""

    digest = hmac.new(
        key.encode(),
        source_id.encode(),
        hashlib.sha256
    ).digest()

    index = int.from_bytes(digest[:8], "big") % len(THEATRE_NAMES)

    for offset in range(len(THEATRE_NAMES)):
        name = THEATRE_NAMES[(index + offset) % len(THEATRE_NAMES)]

        if name not in used_names:
            used_names.add(name)
            return name

    raise IngestionError("All fictional professor names have been assigned")

def parse_term(value: str) -> tuple[str, int, str]:
    """Parse Nebula term names such as 25F, Fall 2025, or 2025 Fall."""
    raw = value.strip()
    short = re.fullmatch(r"(\d{2})([FSU])", raw, re.IGNORECASE)
    if short:
        semester = {"F": "Fall", "S": "Spring", "U": "Summer"}[short.group(2).upper()]
        return semester, 2000 + int(short.group(1)), raw
    long = re.fullmatch(r"(?:(Spring|Summer|Fall)\s+(\d{4})|(\d{4})\s+(Spring|Summer|Fall))", raw, re.I)
    if not long:
        raise IngestionError(f"Unsupported academic term format: {value!r}")
    semester = (long.group(1) or long.group(4)).title()
    year = int(long.group(2) or long.group(3))
    return semester, year, raw


def term_id(semester: str, year: int) -> int:
    return year * 10 + SEMESTER_NUMBER[semester.lower()]


def parse_clock(value: str | None) -> dt_time | None:
    if not value:
        return None
    match = re.search(r"(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?", value, re.I)
    if not match:
        return None
    hour, minute, second = map(int, (match.group(1), match.group(2), match.group(3) or 0))
    suffix = (match.group(4) or "").upper()
    if suffix == "PM" and hour != 12:
        hour += 12
    elif suffix == "AM" and hour == 12:
        hour = 0
    try:
        return dt_time(hour, minute, second)
    except ValueError:
        return None


def meeting_values(meetings: list[dict[str, Any]] | None) -> tuple[str | None, dt_time | None, dt_time | None]:
    """Use the first timed meeting; the schema can represent only one schedule."""
    for meeting in meetings or []:
        start, end = parse_clock(meeting.get("start_time")), parse_clock(meeting.get("end_time"))
        if start or end:
            days = meeting.get("meeting_days") or []
            return ",".join(days)[:20] or None, start, end
    return None, None, None


def load_config(env_path: Path) -> dict[str, str]:
    values = {k: v for k, v in dotenv_values(env_path).items() if v}
    values.update({k: v for k, v in os.environ.items() if v})
    return values


class NebulaClient:
    def __init__(self, api_key: str, *, retries: int = 4, timeout: float = 30.0):
        self.api_key = api_key
        self._local = threading.local()
        self.retries = retries
        self.timeout = timeout

    def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if not hasattr(self._local, "session"):
            self._local.session = requests.Session()
            self._local.session.headers["x-api-key"] = self.api_key
        for attempt in range(self.retries):
            try:
                response = self._local.session.get(f"{API_URL}{path}", params=params, timeout=self.timeout)
                if response.status_code == 429 or response.status_code >= 500:
                    raise requests.HTTPError(f"temporary API status {response.status_code}", response=response)
                response.raise_for_status()
                payload = response.json()
                if payload.get("status") != 200:
                    raise IngestionError(f"Nebula API rejected {path}: {payload.get('message', 'unknown error')}")
                return payload.get("data")
            except (requests.RequestException, ValueError) as exc:
                if attempt + 1 == self.retries:
                    raise IngestionError(f"Nebula request failed after {self.retries} attempts: {path}") from exc
                time.sleep(0.5 * (2**attempt))
        raise AssertionError("unreachable")

    def pages(self, path: str, params: dict[str, Any]) -> Iterable[dict[str, Any]]:
        offset = 0
        while True:
            page = self.get(path, {**params, "offset": offset})
            if not isinstance(page, list):
                raise IngestionError(f"Expected a list from {path}")
            yield from page
            if len(page) < PAGE_SIZE:
                break
            offset += len(page)


@dataclass
class ImportData:
    department: tuple[int, str]
    term: tuple[int, str, int]
    courses: dict[int, tuple[str, str, str]]
    sections: dict[int, tuple[str, int, int, str | None, dt_time | None, dt_time | None]]
    professors: dict[int, tuple[str, int]]
    assignments: set[tuple[int, int]]


def collect(client: NebulaClient, prefix: str, requested_term: str, anon_key: str) -> ImportData:
    semester, year, _ = parse_term(requested_term)
    normalized_term = f"{year % 100:02d}{semester[0].upper()}"
    wanted_names = {requested_term.casefold(), normalized_term.casefold(), f"{semester} {year}".casefold()}
    catalog_year = f"{year % 100:02d}".lstrip("0")

    all_courses = client.get("/course/all")
    candidates = [
        c for c in all_courses
        if c.get("subject_prefix") == prefix
        and str(c.get("catalog_year", "")).lstrip("0") == catalog_year
    ]
    if not candidates:
        raise IngestionError(f"No {prefix} courses found for catalog year {year}")

    dept_name = next((c.get("school") for c in candidates if c.get("school")), prefix)
    dept = (stable_int("department", dept_name), str(dept_name)[:50])
    result = ImportData(dept, (term_id(semester, year), semester, year), {}, {}, {}, set())
    generated_ids: dict[tuple[str, int], str] = {}

    def register(namespace: str, source_key: str) -> int:
        generated = stable_int(namespace, source_key)
        previous = generated_ids.setdefault((namespace, generated), source_key)
        if previous != source_key:
            raise IngestionError(
                f"Deterministic {namespace} ID collision; no database changes were made"
            )
        return generated

    section_pages: dict[str, list[dict[str, Any]]] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        pending = {
            pool.submit(client.get, f"/course/{course['_id']}/sections"): course["_id"]
            for course in candidates if course.get("_id")
        }
        for future in as_completed(pending):
            section_pages[pending[future]] = future.result() or []

    for course in candidates:
        source_course_id = course.get("_id")
        if not source_course_id:
            continue
        course_code = f"{course.get('subject_prefix', prefix)} {course.get('course_number', '')}".strip()
        if not course.get("title") or course.get("description") is None:
            raise IngestionError(f"Course {course_code} lacks a required title or description")
        cid = register("course", course_code)
        result.courses[cid] = (
            str(course["title"])[:50],
            course_code[:20],
            str(course["description"])[:255],
        )
        for section in section_pages[source_course_id]:
            session_name = str((section.get("academic_session") or {}).get("name") or "")
            if session_name.casefold() not in wanted_names:
                continue
            source_section_id = section.get("_id")
            if not source_section_id:
                continue
            sid = register("section", source_section_id)
            days, start, end = meeting_values(section.get("meetings"))
            result.sections[sid] = (
                str(section.get("section_number") or "")[:5], cid, result.term[0], days, start, end
            )
            for source_prof_id in section.get("professors") or []:
                pid = register("professor", source_prof_id)
                result.professors[pid] = (pseudonym(source_prof_id, anon_key), dept[0])
                result.assignments.add((sid, pid))

    if not result.sections:
        raise IngestionError(f"No {prefix} sections found for term {requested_term}")

    used_names = set()
    for pid in sorted(result.professors):
        _, department_id = result.professors[pid]

        name = fictional_professor_name(
            str(pid),
            anon_key,
            used_names
        )

        result.professors[pid] = (name, department_id)
    return result


def check_id_collisions(data: ImportData) -> None:
    # Dict construction catches same-target collisions only if payload differs.
    if any(not row[0] for row in data.sections.values()):
        raise IngestionError("A source section has no section number")


def write(conn: Any, data: ImportData) -> None:
    """Upsert the source-backed graph in one transaction."""
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            'INSERT INTO Department (DepartmentID, DepartmentName) VALUES (%s,%s) '
            'ON CONFLICT (DepartmentID) DO UPDATE SET DepartmentName=EXCLUDED.DepartmentName', data.department
        )
        cur.execute(
            'INSERT INTO AcademicTerm (TermID, Semester, YearNum) VALUES (%s,%s,%s) '
            'ON CONFLICT (TermID) DO UPDATE SET Semester=EXCLUDED.Semester, YearNum=EXCLUDED.YearNum', data.term
        )
        cur.executemany(
            'INSERT INTO Courses (CourseID, CourseName, CourseCode, CourseDescription) VALUES (%s,%s,%s,%s) '
            'ON CONFLICT (CourseID) DO UPDATE SET CourseName=EXCLUDED.CourseName, CourseCode=EXCLUDED.CourseCode, CourseDescription=EXCLUDED.CourseDescription',
            [(key, *value) for key, value in data.courses.items()],
        )
        cur.executemany(
            'INSERT INTO Professors (ProfessorID, ProfessorName, ProfessorDepartment) VALUES (%s,%s,%s) '
            'ON CONFLICT (ProfessorID) DO UPDATE SET ProfessorName=EXCLUDED.ProfessorName, ProfessorDepartment=EXCLUDED.ProfessorDepartment',
            [(key, *value) for key, value in data.professors.items()],
        )
        cur.executemany(
            'INSERT INTO Sections (SectionID, SectionName, CourseID, TermID, MeetingDays, StartTime, EndTime) '
            'VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (SectionID) DO UPDATE SET '
            'SectionName=EXCLUDED.SectionName, CourseID=EXCLUDED.CourseID, TermID=EXCLUDED.TermID, '
            'MeetingDays=EXCLUDED.MeetingDays, StartTime=EXCLUDED.StartTime, EndTime=EXCLUDED.EndTime',
            [(key, *value) for key, value in data.sections.items()],
        )
        cur.executemany(
            'INSERT INTO TeachingAssignment (SectionID, ProfessorID) VALUES (%s,%s) ON CONFLICT DO NOTHING',
            sorted(data.assignments),
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--term", required=True, help="Nebula academic session, e.g. 25F")
    parser.add_argument("--prefix", default="CS", help="course subject prefix (default: CS)")
    parser.add_argument("--env-file", type=Path, default=Path(__file__).parents[1] / ".env")
    parser.add_argument("--dry-run", action="store_true", help="fetch and validate without writing")
    args = parser.parse_args(argv)
    config = load_config(args.env_file)
    missing = [name for name in ("NEBULALABS_API_KEY", "ANONYMIZATION_KEY") if not config.get(name)]
    if not args.dry_run and not config.get("DATABASE_URL"):
        missing.append("DATABASE_URL")
    if missing:
        parser.error("missing configuration: " + ", ".join(missing))

    data = collect(NebulaClient(config["NEBULALABS_API_KEY"]), args.prefix.upper(), args.term, config["ANONYMIZATION_KEY"])
    check_id_collisions(data)
    if not args.dry_run:
        import psycopg

        with psycopg.connect(config["DATABASE_URL"]) as conn:
            write(conn, data)
    print(
        f"Imported {len(data.courses)} courses, {len(data.sections)} sections, "
        f"{len(data.professors)} anonymized professors, and {len(data.assignments)} teaching assignments"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
