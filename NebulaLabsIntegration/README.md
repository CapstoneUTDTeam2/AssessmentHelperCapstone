# Nebula ingestion

The importer loads the source-backed portion of the Assessment Helper schema for one
subject and academic term. It retrieves all courses once, concurrently retrieves their
sections, retries transient API failures, and commits all database changes in one
transaction. Deterministic integer keys and PostgreSQL upserts make reruns safe.

## Field mapping

| PostgreSQL | Nebula source |
| --- | --- |
| `Department` | course `school` for the selected subject |
| `AcademicTerm` | section `academic_session.name` |
| `Courses` | `subject_prefix`, `course_number`, `title`, `description` |
| `Sections` | `section_number`, first timed `meetings` entry |
| `Professors` | professor reference ID, converted to a keyed pseudonym |
| `TeachingAssignment` | section `professors` references |

The schema can represent only one meeting pattern, so the first meeting with a start or
end time is stored. Strings longer than the schema columns are truncated. Missing course
titles/descriptions and section numbers cause the run to fail instead of inventing data.
See [the anonymization decision](../docs/professor-anonymization.md) for privacy details
and the list of application-owned tables intentionally left untouched.

## Configuration

Copy `.env.example` to `.env` and set all values. Keep `ANONYMIZATION_KEY` stable across
runs and environments that must produce the same pseudonyms. A suitable value can be
generated with `openssl rand -hex 32`. Neither secret may be committed.

## Docker Compose workflow

Start PostgreSQL:

```bash
docker compose up -d db
```

For a **new, empty development database only**, install the authoritative schema. The
current DDL intentionally drops existing public tables and must not be run against a
database containing data that should be retained:

```bash
docker compose exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < Databasing/CapstoneDDLScript.sql
```

Run ingestion, changing the term and prefix as required:

```bash
docker compose --profile tools run --rm ingest --term 25F --prefix CS
```

Validate source mapping without writing to PostgreSQL:

```bash
docker compose --profile tools run --rm ingest --term 25F --prefix CS --dry-run
```
