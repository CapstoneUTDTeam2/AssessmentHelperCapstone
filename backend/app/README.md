# Assessment Helper backend (`app/`)

FastAPI backend for faculty evaluation: health checks, evaluation-cycle status, current-semester observee classes, observer eligibility, and documented observer-request endpoints.

Requests hit `main.py`, which mounts routers from `api/`. Evaluation status is read from the database view, not recalculated in Python.

```text
GET /api/evaluation-status
        ↓
main.py  →  api/evaluation_cycle.py  →  Postgres
        ↓
ProfessorEvaluationStatus  (Databasing/ProfEvalStat.sql)
        ↓
JSON
```

## Layout

| File | Purpose |
|---|---|
| `main.py` | Creates the FastAPI app, mounts routers, `/health` and `/health/db` |
| `db.py` | One SQLAlchemy engine from `DATABASE_URL` |
| `api/` | HTTP routes (URLs, request/response, DB reads) |

Empty `__init__.py` files make these folders importable as packages.



## What is implemented

### Health

- `GET /health` — process is up
- `GET /health/db` — can reach Postgres (`SELECT 1`)

### Evaluation-cycle status (`AHC-221` + `AHC-218`)

Due / overdue rules live in `Databasing/ProfEvalStat.sql` (`ProfessorEvaluationStatus`):

`api/evaluation_cycle.py` only selects from that view:

- `GET /api/evaluation-status` — every professor
- `GET /api/evaluation-status?status=Due` — optional filter (`Due`, `Overdue`, `Not Due`, `Unknown`)
- `GET /api/evaluation-status/due` — professors due this cycle
- `GET /api/evaluation-status/overdue` — professors overdue this cycle
- `GET /api/evaluation-status/{professor_id}` — one professor

### Observee current-semester classes (`AHC-223`)

`TeachingAssignment` + `Sections` + `Courses` for the latest Spring/Fall `EvaluationCycle` term:

- `GET /api/observees/{professor_id}/classes` — sections that observee teaches this semester

### Course catalog and teaching history (`AHC-354`)

Same tables as current-semester classes. `/classes` is unchanged.

- `GET /api/courses` — every course (code, name, description) plus current-cycle sections and instructors
- `GET /api/courses/{course_id}` — one course
- `GET /api/observees/{professor_id}/teaching-history` — that professor's sections grouped by term (seed data is only Fall 2026)

### CourseBook ingest

`POST /api/coursebook/ingest` pulls UTD CourseBook through the Nebula Labs API into `Department`, `AcademicTerm`, `Courses`, `Sections`, `Professors`, and `TeachingAssignment`. Optional `?prefix=CS` and `?term=26F` (defaults to the current evaluation-cycle term). Needs `NEBULALABS_API_KEY` and `ANONYMIZATION_KEY`. A failed pull leaves existing rows unchanged (`502`/`503`).

### Observee signup and observer pool (`AHC-224` + `AHC-226` + `AHC-227`)

`api/observee_signup.py`:

- `POST /api/signups` — observee signs up for one section they teach. Body: `professor_id`, `section_id`, optional `preferred_dates` (list of `YYYY-MM-DD`), optional `cycle_id` (defaults to the current cycle). Returns `201` with the new `Pending` signup.
  - `404` unknown professor, section, or cycle
  - `400` section not in the cycle's term, professor does not teach the section, the signup deadline has passed, or a preferred date is in the past, after the observation deadline, or not a day the class meets
  - `409` observee already has a signup this cycle (one course per cycle, `MAX_SIGNUPS_PER_CYCLE = 1`)
- `GET /api/observees/{professor_id}/signup` — that observee's signup for the current cycle (`404` if none). Optional `?cycle_id=`.
- `GET /api/observer-pool` — everyone who signed up or is an active `ObserverEnrollment` this cycle, with department and course levels taught this term. Optional `?cycle_id=`.

Signing up also adds an `ObserverEnrollment` row, so signing up puts a professor in the observer pool. Preferred dates go in `SignupPreferredDate`. Signups take a table lock while checking the one-course limit, so two requests at the same time cannot both get through.

### Observer eligibility (`AHC-243`)

`POST /api/match-observers` filters the observer pool. An observer is eligible only if they:

- signed up this cycle (in the pool)
- are not the observee
- are in the same department
- teach the same course level this term (first digit of the course code × 1000)
- are free during that class time (no overlapping `MeetingDays` / `StartTime` / `EndTime`)

Body: `faculty_id`, optional `course_id` or `section_id` (defaults to the observee's signup), optional `requested_day` / `requested_time` (defaults to that section's meeting pattern). Returns up to 5 observers; if more than 5 qualify, 5 are chosen at random. `insufficient` is `true` when nobody qualifies.

### Observer lists per signup (`AHC-245`)

Uses the same eligibility rules, once per `ObservationSignup`:

- `GET /api/signups/{signup_id}/eligible-observers` — up to 5 observers for that signup
- `POST /api/match-observers/signups` — every signup in the cycle (optional `?cycle_id=`)

`POST /api/signups` and `GET /api/observees/{professor_id}/signup` also include `observers` and `insufficient` so a new signup immediately gets its list.

### Observer selection (`AHC-247` + `AHC-246` + `AHC-248`)

`api/observer_selection.py`. Eligibility comes from the database function `get_eligible_observers`, the same check `ObserverRequest` uses, so anyone on a list can be sent a request.

- `POST /api/observer-selection/start` — committee starts selection (`400` before the signup deadline passes). For each `Pending` / `Matched` / `Unmatched` signup it picks up to 5 observers (random if more qualify), saves them in `SignupObserverList`, and sets status to `Matched` or `Unmatched`. Signups already `List Ready` or `Accepted` keep their list. Optional `?cycle_id=`.
- `GET /api/observer-selection/alerts` — signups with no eligible observers (`level: none`) or fewer than 5 (`level: low`). Optional `?cycle_id=`.
- `GET /api/signups/{signup_id}/observer-list` — the saved list for one signup
- `POST /api/observer-selection/notify` — committee sends the lists: `Matched` signups become `List Ready`. Optional `?cycle_id=`, `?signup_id=` for one signup.
- `GET /api/observees/{professor_id}/notifications` — the observee's "observer list is ready" notification with their saved list. Optional `?cycle_id=`.

The list is saved once, so the committee, the notification, and `GET /api/observees/{professor_id}/signup` all show the same names.

### Evaluation cycle deadline handling (`AHC-223`)

The database triggers already reject late signups, observations, and surveys. `api/cycle_deadlines.py` is the API side:

- `GET /api/evaluation-cycles` — every cycle, newest first, with deadlines and phase
- `GET /api/evaluation-cycles/current` — current cycle's deadlines, which are still open, `days_left`, the `next_deadline`, and `phase` (`signup`, `observation`, `post_observation_feedback`, `app_feedback`, `closed`)
- `GET /api/evaluation-cycles/{cycle_id}` — one cycle
- `PUT /api/evaluation-cycles/{cycle_id}/deadlines` — set or extend deadlines. Body: any of `signup`, `observation`, `post_observation_feedback`, `app_feedback` (`YYYY-MM-DD`); fields left out keep their current date. Returns `400` if the new dates break the order the DDL requires, `404` for an unknown cycle.

A deadline is open through the end of its date, the same rule as the triggers. Other routers should use the shared helpers instead of writing their own checks:

- `resolve_cycle(conn, cycle_id=None)` — cycle row (current cycle if `None`), `404` if missing
- `require_before_deadline(cycle, "signup", date)` — raises a `400` with a readable message (used by `POST /api/signups`)
- `dates_before_deadline(cycle, "observation", dates)` — `True` if every date is on or before the deadline (for proposed observation dates in `observer_requests.py`)

### Frontend access (CORS)

`main.py` allows the React dev server (`http://localhost:5173` and `http://127.0.0.1:5173`) to call the API from the browser. Without this the browser blocks every request from the frontend. Set `CORS_ORIGINS` (comma separated) to allow other addresses.

## How to run (Docker Compose)

From the **repo root**, with Docker Desktop running:

```bash
cp .env.example .env    # once
docker compose up --build
```

On **first** volume create only, Postgres runs:

1. `Databasing/CapstoneDDLScript.sql` — 12 tables
2. `Databasing/CapstoneDMLScript.sql` — sample data
3. `Databasing/ProfEvalStat.sql` — `ProfessorEvaluationStatus` view

Later `docker compose up` reuses the data. To reload from scratch:

```bash
docker compose down -v
docker compose up --build
```

- Docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health` and `/health/db`
- Evaluation status: `http://127.0.0.1:8000/api/evaluation-status`

## How to inspect and test

```bash
docker exec -it ah_db psql -U ah_user -d assessment_helper
```

```sql
\dt
SELECT * FROM ProfessorEvaluationStatus;
\q
```

```bash
curl http://127.0.0.1:8000/health/db
curl http://127.0.0.1:8000/api/evaluation-status
curl http://127.0.0.1:8000/api/evaluation-status/due
curl http://127.0.0.1:8000/api/evaluation-status/overdue
curl 'http://127.0.0.1:8000/api/evaluation-status?status=Due'
curl http://127.0.0.1:8000/api/evaluation-status/1
curl http://127.0.0.1:8000/api/observees/1/classes
curl http://127.0.0.1:8000/api/observees/1/teaching-history
curl http://127.0.0.1:8000/api/courses
curl http://127.0.0.1:8000/api/courses/1
curl http://127.0.0.1:8000/api/observer-pool
curl http://127.0.0.1:8000/api/observees/1/signup
curl -X POST http://127.0.0.1:8000/api/signups \
  -H 'Content-Type: application/json' \
  -d '{"professor_id": 5, "section_id": 6, "preferred_dates": ["2026-11-03"]}'
curl -X POST http://127.0.0.1:8000/api/match-observers \
  -H 'Content-Type: application/json' \
  -d '{"faculty_id": 1}'
curl http://127.0.0.1:8000/api/signups/1/eligible-observers
curl -X POST http://127.0.0.1:8000/api/match-observers/signups
curl http://127.0.0.1:8000/api/observer-selection/alerts
curl -X POST http://127.0.0.1:8000/api/observer-selection/start
curl http://127.0.0.1:8000/api/signups/3/observer-list
curl -X POST http://127.0.0.1:8000/api/observer-selection/notify
curl http://127.0.0.1:8000/api/observees/3/notifications
```

Note: the sample cycle's signup deadline is 2026-09-15, so `POST /api/signups` returns the deadline error on the sample data until that date is moved forward, for example:

```bash
curl http://127.0.0.1:8000/api/evaluation-cycles/current
curl -X PUT http://127.0.0.1:8000/api/evaluation-cycles/2/deadlines \
  -H 'Content-Type: application/json' \
  -d '{"signup": "2026-11-01"}'
```

## Tests

`backend/tests/` runs against a real, throwaway Postgres database (see `tests/conftest.py`):

```bash
docker exec ah_db createdb -U ah_user assessment_helper_test
cd backend
pip install -r requirements.txt -r requirements-dev.txt
TEST_DATABASE_URL=postgresql+psycopg://ah_user:changeme@localhost:5432/assessment_helper_test pytest
```
