# Assessment Helper backend (`app/`)

FastAPI backend for faculty evaluation: health checks, evaluation-cycle status, current-semester observee classes, and documented observer-request endpoints.

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

### Observee signup and observer pool (`AHC-224` + `AHC-226` + `AHC-227`)

`api/observee_signup.py`:

- `POST /api/signups` — observee signs up for one section they teach. Body: `professor_id`, `section_id`, optional `preferred_times`, optional `cycle_id` (defaults to the current cycle). Returns `201` with the new `Pending` signup.
  - `404` unknown professor, section, or cycle
  - `400` section not in the cycle's term, professor does not teach the section, or the signup deadline has passed
  - `409` observee already has a signup this cycle (one course per cycle, `MAX_SIGNUPS_PER_CYCLE = 1`)
- `GET /api/observees/{professor_id}/signup` — that observee's signup for the current cycle (`404` if none). Optional `?cycle_id=`.
- `GET /api/observer-pool` — everyone who signed up this cycle, with department and course levels taught this term. Optional `?cycle_id=`.

Signing up is what puts a professor in the observer pool, so there is no separate pool table to keep in sync. Signups take a table lock while checking the one-course limit, so two requests at the same time cannot both get through.

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
curl http://127.0.0.1:8000/api/observer-pool
curl http://127.0.0.1:8000/api/observees/1/signup
curl -X POST http://127.0.0.1:8000/api/signups \
  -H 'Content-Type: application/json' \
  -d '{"professor_id": 5, "section_id": 6, "preferred_times": "Tuesday afternoon"}'
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
