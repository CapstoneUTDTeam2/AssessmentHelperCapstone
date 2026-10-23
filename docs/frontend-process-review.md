# Frontend vs process document

Reviewed against `docs/READ-BEFORE-CHANGE.md` (the process text). The original PDF is stored as `docs/READ-BEFORE-CHANGE.pdf`.

`Unknown` means the process text does not say, so the UI must not invent a rule.

## Explicit contradictions (fixed in the UI)

These were on screen and disagreed with the process. Copy and defaults were changed; leftover mock files are no longer what those pages show.

| Where | Frontend said | Process says |
|---|---|---|
| Faculty Evaluations → Observer Matching | “Observers **above** your level (4000s)” | Same course level, same department, free at that class time, not yourself |
| Faculty Evaluations → Observation Requests | “Colleagues **below** your level” | Same-level, same-department colleagues |
| My Profile appointment rows | “Can be observed by Associate or Full” / “Can observe Assistant Professors, Lecturers” | Matching is by course level and department, not rank |
| Faculty mock / Full Professor | “Every **3** years (full rule)” | Associate **and** Full: once every **2 calendar years** |
| Settings → Assistant cycle | “Every semester (Fall & Spring)” | Assistant: once every **calendar year** (Spring *or* Fall of the next year) |
| Settings → observer level rule | Options for “Same or higher” / “Strictly higher”, cross-department toggle | Eligibility is same level + same department only |
| Settings → max recommendations | 3 / 5 / 7 / 10 | Show **5** observers (or fewer + alert) |
| Sign-up buttons | Separate “Sign Up to Observe” and “Sign Up to Be Observed” | Signing up to be observed puts the professor in the observer pool automatically |
| Faculty Evaluations stats | “2 more required this cycle” | One course / one signup per cycle for now |
| AC Dashboard KPI “Avg. Observations / Observer · KPI 2.3” | Invented KPI 2.3 | Process KPI 3a is **list sufficiency** (average matches / sign-ups). 2.3 is not in the process |
| AC Participation KPI | “56 of 64 faculty” | Signed up this cycle / professors who were **due** |

## Unknown (not in the process text)

Do not treat these as product rules. The UI either dropped the claim or shows “—” / empty until an API exists.

### Evaluation cycle

- **Lecturer frequency.** Process only names Assistant (1 year) and Associate/Full (2 years). Lecturer cycle in Settings is unlabeled as unknown.
- **Skip first-semester faculty.** Not in the process.
- **Hire date vs program start / StartTermID.** Process uses last observation + rank. The SQL view also uses start term; that extra rule is not in this process text.
- **Never-evaluated faculty.** Process examples all have a last observation. The view marks some as Unknown; whether that is correct is unknown here.
- **Two formal evaluations per cycle.** Process is one observation signup per course, one confirmed observer. “2 required” was frontend-only.
- **Summer cycles.** Process talks about Spring/Fall. Settings already said no summer; that is consistent but not spelled out as a rule.

### Observee / Observer flows (no backend yet)

`backend/app/api/observer_requests.py` is still stubs. Until those routes exist, the frontend must not show fake requests or fake confirmed sessions as if they were real.

- Incoming observation requests (observer confirms 1, 2, or 3)
- Observee chooses among confirmed observers and graceful-declines the rest
- Remembering the chosen confirmed observer
- Observee marks that the observation could not happen this cycle
- Observer uploads the signed observation; observee upload for trouble during observation
- Dual signatures (observee + observer) meaning the observation happened
- End-of-process survey (ok / not ok, difficulties, improvements)
- AC emails: due/overdue reminder, signup deadline, observation-period deadline, survey request
- AC seeing every signup with **email** (API has name, course, section, days/time; not email)
- AC completing observer selection **manually** (process: stretch goal)
- KPI 1a Eligibility Accuracy, 2b Observer Utilization, 4a Missing Observation Count, 4b Survey Completion Rate
- Executive “Outstanding Observation Report — breakdown by hire-level”

### Data the UI used to invent

Not in the process and not on the current APIs: rooms, enrollment/capacity, credit hours, prereqs, office hours, UTD ID, tenure date, CourseBook pull, auth, “evaluations given this year”, formal outcomes (Exceeds / Meets / Needs improvement) as the observation result.

### Settings knobs not in the process

The process lets AC change the **template, criteria, and ratings**, and the **deadlines** they notify people about. It does not say AC can change eligibility, recommendation count, load-balancing, or cycle length. Those Settings controls are unknown / not authorized by this document. Deadline fields are wired to `PUT /api/evaluation-cycles/{id}/deadlines`.

## Backend endpoints the frontend should use

| Process need | Endpoint | Wired on |
|---|---|---|
| Due / overdue lists; next due semester | `GET /api/evaluation-status`, `/due`, `/overdue`, `/{id}` | Faculty, AC Dashboard, AC Evaluations, My Profile, Teacher Dashboard |
| Observee classes (days & times) | `GET /api/observees/{id}/classes` | My Profile, Teacher Dashboard schedule, observee signup |
| Teaching history | `GET /api/observees/{id}/teaching-history` | My Profile |
| Course catalog | `GET /api/courses` | Courses, Faculty course chips |
| One course signup + preferred dates | `POST /api/signups`, `GET /api/observees/{id}/signup` | Sign Up to Be Observed |
| Observer pool after signup | automatic on `POST /api/signups` | Signup status line |
| List of 5 observers | signup `observers`, `GET /api/signups/{id}/eligible-observers`, `POST /api/match-observers/signups` | Faculty Evaluations matching, AC selection |
| AC start selection after signup deadline | `POST /api/observer-selection/start` | AC Dashboard button |
| Alert: no / insufficient observers | `GET /api/observer-selection/alerts` | AC Dashboard, Faculty unmatched filter |
| Notify observee list is ready | `POST /api/observer-selection/notify`, `GET /api/observees/{id}/notifications` | AC Dashboard notify; Faculty Evaluations matching |
| Cycle deadlines | `GET /api/evaluation-cycles/current`, `PUT /api/evaluation-cycles/{id}/deadlines` | Settings, signup window |
| AC see signups (course, section, days/time, name) | signup lists from match/selection | AC Dashboard selection panel |

Not implemented on the backend, so not wired: observer-request confirm/accept/decline, surveys, report upload, email send, KPI generation, criteria save, auth.

## Live API issues seen while verifying

These are backend/data problems, not frontend process contradictions:

- `GET /api/observees/1/signup` returns 500 on the current Docker database. The faculty UI still loads classes and cycle; the observee list stays empty until this route is healthy.
- `GET /api/observer-selection/alerts` returns 500 (likely `get_eligible_observers` missing in this database). AC unmatched counts stay 0; `POST /api/match-observers/signups` still works and showed 9 signups / 17 matches.
- Seed due/overdue lists are empty this semester (`GET /api/evaluation-status/due` is `[]`). The dashboard correctly shows 0 due.
