# Assessment Helper backend (`app/`)

FastAPI backend for faculty evaluation: health checks, evaluation-cycle status, and documented observer-request endpoints.

Requests hit `main.py`, which mounts routers from `api/`. Implemented routes load data through `db.py` and call rule functions in `services/`.

```text
GET /api/evaluation-status
        ↓
main.py  →  api/evaluation_cycle.py  →  Postgres (db.py)
        ↓
services/evaluation_cycle.py   (1-year / 2-year math)
        ↓
JSON
```

## Layout

| File | Purpose |
|---|---|
| `main.py` | Creates the FastAPI app, mounts routers, `/health` and `/health/db` |
| `db.py` | One SQLAlchemy engine from `DATABASE_URL` |
| `api/` | HTTP routes (URLs, request/response, DB reads) |
| `services/` | Business rules with no HTTP and no database |

Empty `__init__.py` files make these folders importable as packages.

`DATABASE_URL` is not a file. Docker Compose sets it on the backend container from `.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`). Running `uvicorn` locally without that variable fails on import.

Postgres stores unquoted column names in lowercase (`semester`, `yearnum`, `professorid`). The evaluation-status queries read those lowercase keys.

## What is implemented

### Health

- `GET /health` — process is up
- `GET /health/db` — can reach Postgres (`SELECT 1`)

### Evaluation-cycle calculations (`AHC-221`)

`services/evaluation_cycle.py` decides how often someone is evaluated:

- Assistant Professor: every **1** calendar year, same semester
- Associate / Full Professor: every **2** calendar years, same semester
- After the due semester they are **Overdue**
- First-semester professors are **Not Due**
- Never evaluated (and not first semester) is **Due**

`api/evaluation_cycle.py` exposes that:

- `GET /api/evaluation-status` — every professor
- `GET /api/evaluation-status/{professor_id}` — one professor

These read `Professors`, last completed `Observation`, start term, and the latest Spring/Fall `EvaluationCycle`.

Unit tests live in `backend/tests/test_evaluation_cycle.py` and do **not** need Docker or `DATABASE_URL`.

## How to run (Docker Compose)

From the **repo root**, with Docker Desktop running:

```bash
cp .env.example .env    # once
docker compose up --build
```

That starts Postgres (`ah_db`) and FastAPI (`ah_backend`). On **first** volume create only, Postgres runs:

1. `Databasing/CapstoneDDLScript.sql` — 12 tables
2. `Databasing/CapstoneDMLScript.sql` — sample professors, cycles, observations

Later `docker compose up` reuses the data. To reload the scripts from scratch:

```bash
docker compose down -v
docker compose up --build
```

- Docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health` and `/health/db`
- Evaluation status: `http://127.0.0.1:8000/api/evaluation-status`

## How to inspect and test

See tables in the running database:

```bash
docker exec -it ah_db psql -U ah_user -d assessment_helper
```

```sql
\dt
SELECT ProfessorID, ProfessorName, CurrentLevel FROM Professors;
\q
```

Hit the live API (needs Compose up and seeded tables):

```bash
curl http://127.0.0.1:8000/health/db
curl http://127.0.0.1:8000/api/evaluation-status
curl http://127.0.0.1:8000/api/evaluation-status/1
```

Unit tests (venv only, no database):

```bash
cd backend
source .venv/bin/activate
python -m unittest tests.test_evaluation_cycle -v
```
