# Professor-name anonymization (AHC-11)

## Recommendation

Use keyed deterministic pseudonyms derived from Nebula's professor ID. The importer uses
`HMAC-SHA-256(ANONYMIZATION_KEY, professor_id)` and stores `Professor <12 hex characters>`.
The key stays in `.env`, never in PostgreSQL or source control. This gives one professor the
same replacement across sections, terms, and repeated imports without storing their name,
email, or a reversible lookup table. Preserve the key across deployments and backups;
rotating or losing it changes the displayed identities.

Alternatives considered:

- Sequential labels (`Professor 1`) are readable, but assignment order changes between runs
  and a persistent source-ID lookup table adds sensitive state and schema changes.
- Unkeyed hashes are stable but permit dictionary attacks when source professor IDs are known.
- Random UUIDs are strong pseudonyms but need a durable mapping table that the current schema
  does not provide.
- Encrypting real names is reversible and creates key-management and disclosure risk without
  helping the application's matching requirements.

## Data handling and limits

The importer fetches professor records only to validate references. It imports neither names
nor other identity-bearing professor fields (email, phone, office, profile/image URLs, titles,
or office hours). It also excludes syllabus URLs, locations, teaching assistants, and arbitrary
section attributes because they are outside the current schema and may contain names. Course
titles/descriptions and schedule data are retained because the application requires them;
free-text descriptions supplied by Nebula could still incidentally contain a person's name.

This is **pseudonymization, not guaranteed anonymization**. Teaching history, department,
course, section, term, and meeting time can be compared with public CourseBook data to
reidentify an instructor. The deterministic database `ProfessorID` also remains linkable
between imports. Access controls and data minimization are still required, and the
`ANONYMIZATION_KEY` must be treated as a secret. Stronger protection would require suppressing
or generalizing teaching/schedule data, which would conflict with observer matching and needs
an explicit product/privacy decision.

## Imported and application-generated tables

Nebula supplies `Department`, `AcademicTerm`, `Courses`, `Sections`, `Professors`, and
`TeachingAssignment`. The current schema's `CurrentLevel` and `StartTermID` have no reliable
Nebula source and remain null for committee maintenance. `EvaluationCycle`,
`ObservationTemplate`, `ObservationSignup`, `ObserverRequest`, `Observation`, and
`SurveyResponse` are application/workflow data and are not fabricated by ingestion.
