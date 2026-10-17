# Local database setup and NebulaLabs import

Run all commands from the **repository root**. Requires Docker and Docker Compose.

## 1. Configure the environment

```bash
cp .env.example .env
```

Open `.env` and set:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — local PostgreSQL credentials (the defaults in `.env.example` are fine for development).
- `NEBULALABS_API_KEY` — a valid NebulaLabs API key, required for the import.
- `ANONYMIZATION_KEY` — a stable secret for generating fictional professor names. Generate one with `openssl rand -hex 32` and reuse it for subsequent imports.

Do not commit `.env` or share either key in the repository.

## 2. Start a local PostgreSQL instance

```bash
docker compose up -d db
```

On **first startup with a new volume**, PostgreSQL automatically runs:

1. `Databasing/CapstoneDDLScript.sql` — tables, constraints, and triggers.
2. `Databasing/CapstoneDMLScript.sql` — existing sample/test records.
3. `Databasing/ProfEvalStat.sql` — `ProfessorEvaluationStatus` view.

Verify startup:

```bash
docker compose ps
docker compose logs --tail=50 db
```

**Important:** These scripts run only when the database volume is first created. Restarting the container does not reapply changed SQL files.

## 3. Import NebulaLabs data

Specify the academic term and course subject you want to import (example: Fall 2025, Computer Science):

```bash
docker compose --profile tools run --rm ingest --term 25F --prefix CS
```

To check the import without writing to the database:

```bash
docker compose --profile tools run --rm ingest --term 25F --prefix CS --dry-run
```

Change `25F` and `CS` as needed. Rerunning an import uses upserts for its source-backed records rather than blindly duplicating them.

The importer populates **Department, AcademicTerm, Courses, Sections, Professors, and TeachingAssignment**. It does **not** populate workflow data such as observation signups, observer requests, completed observations, surveys, or professor employment levels/start terms. The initial sample data provides some of those records for testing; additional use cases may require separate test data.

Imported professor names are fictionalized. Preserve the same `ANONYMIZATION_KEY` for consistent generated names across reruns.

## 4. Connect and verify

Connect from pgAdmin or any local SQL client using:

- Host: `localhost`
- Port: `5432`
- Database, username, and password: values from your `.env`

Alternatively, open `psql` in the container:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Example verification queries:

```sql
SELECT COUNT(*) FROM Professors;
SELECT COUNT(*) FROM Courses;
SELECT COUNT(*) FROM Sections;
SELECT COUNT(*) FROM TeachingAssignment;

SELECT p.ProfessorName, c.CourseCode, s.SectionName,
       s.MeetingDays, s.StartTime, s.EndTime
FROM TeachingAssignment ta
JOIN Professors p ON p.ProfessorID = ta.ProfessorID
JOIN Sections s ON s.SectionID = ta.SectionID
JOIN Courses c ON c.CourseID = s.CourseID
LIMIT 20;
```

For backend containers on the same Compose network, the database host is **`db`**, not `localhost`. The `backend` service already has `DATABASE_URL` configured in `docker-compose.yml`.

## 5. Reset the local database (destructive)

To delete **all local database data** and recreate the instance from the initialization scripts:

```bash
docker compose down -v
docker compose up -d db
```

This removes the PostgreSQL volume and all imported or manually added data. Run the NebulaLabs import again afterward if needed.

If port `5432` is already in use, stop the other local PostgreSQL service/container or adjust the host-side port mapping in `docker-compose.yml`.

For importer details and field mappings, see [`NebulaLabsIntegration/README.md`](../NebulaLabsIntegration/README.md).
