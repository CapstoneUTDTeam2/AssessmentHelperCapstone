# Assessment Helper backend (`app/`)

FastAPI backend for faculty evaluation: health checks, evaluation-cycle status, and documented observer-request endpoints.

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

- Assistant Professor: every **1** calendar year, same semester
- Associate / Full Professor: every **2** calendar years, same semester
- After the due semester they are **Overdue**
- First-semester professors are **Not Due**

`api/evaluation_cycle.py` only selects from that view:

- `GET /api/evaluation-status` — every professor
- `GET /api/evaluation-status/{professor_id}` — one professor

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
curl http://127.0.0.1:8000/api/evaluation-status/1
```
