# Frontend Data Requirements

This document lists the data the frontend reads from, or sends to, the backend and database. It covers everything the current pages show or save, including data that still comes from mocks (`frontend/src/data/*Mock.ts`, `frontend/src/auth/demoAccounts.ts`) or is typed directly into the JSX.

**Database Matches** compares each item with the database on the `Attempting-to-Connect-With-Front` branch (`Databasing/`):

- ✓ The database stores the value, or it can be calculated from existing tables, views or functions.
- ✗ The database has no source for it. Display-only values (colors, tones, labels) are marked ✗ because they aren't stored, but they don't need to be.

A data row is ✓ only when every one of its fields is ✓. Items marked ✗ that need a database change are listed under [To Fix](#to-fix).

Rows marked ✓ that the backend has no working route for yet are listed under [Missing Backend Routes](#missing-backend-routes).

---

## 1. Auth and current user

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Login request** | | | ✗ |
| | email | string | ✗ |
| | password | string | ✗ |
| | role | enum: `coordinator`, `faculty` | ✗ |
| **Current user** | | | ✗ |
| | email | string | ✗ |
| | name | string | ✓ |
| | title | string | ✗ |
| | role | enum: `coordinator`, `faculty` | ✗ |
| | professorId | integer? | ✓ |
| | departmentLabel | string | ✓ |
| **Password reset** | | | ✗ |
| | email | string | ✗ |

---

## 2. Academic term and evaluation cycle

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Current cycle** | | | ✗ |
| | id | integer | ✓ |
| | semester | enum: `Spring`, `Fall` | ✓ |
| | year | integer | ✓ |
| | startDate | date | ✗ |
| | signupDeadline | date | ✓ |
| | observationDeadline | date | ✓ |
| | templateId | integer (the cycle's observation template; whether the criteria are locked is that template's `isLocked`, see section 9) | ✓ |
| **Cycle list** | | | ✓ |
| | id | integer | ✓ |
| | semester | enum: `Spring`, `Fall` | ✓ |
| | year | integer | ✓ |
| **Update deadlines** | | | ✓ |
| | cycleId | integer | ✓ |
| | signupDeadline | date | ✓ |
| | observationDeadline | date | ✓ |
| **Server date** | | | ✓ |
| | today | date | ✓ |
| **Sync status** | | | ✗ |
| | lastSyncedAt | datetime | ✗ |
| | lastCourseBookPull | date | ✗ |
| | lastPullSucceeded | boolean | ✗ |

---

## 3. Faculty / professors

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Faculty list row** | | | ✗ |
| | id | integer | ✓ |
| | name | string | ✓ |
| | email | string | ✗ |
| | level | string (`CurrentLevel`, e.g. `Assistant Professor`, `Associate Professor`, `Full Professor`) | ✓ |
| | courses | string[] | ✓ |
| | observationsReceived | integer (this cycle; no required count) | ✓ |
| | status | string (`ProfessorEvaluationStatus`.`EvaluationStatus` with `NextDueSemester` / `NextDueYear`, e.g. `Due Spring 2027`, `Overdue`) | ✓ |
| | unmatched | boolean | ✓ |
| | needsObserver | boolean | ✓ |
| **Faculty summary** | | | ✓ |
| | totalFaculty | integer | ✓ |
| | countByRank | { level: string (`CurrentLevel`), count: integer }[] | ✓ |
| **Faculty detail** | | | ✓ |
| | cycle | string (from `ProfessorEvaluationStatus`.`FrequencyYears`, e.g. `Every 2 years`) | ✓ |
| | lastEvaluation | date? | ✓ |
| | nextEvaluation | string (term: `ProfessorEvaluationStatus`.`NextDueSemester` / `NextDueYear`, e.g. `Spring 2027`) | ✓ |
| | instructorLevels | string[] | ✓ |
| | pastEvents | EvaluationEvent[] | ✓ |
| | upcomingEvents | EvaluationEvent[] | ✓ |
| | theyCanObserve | ObserverMatch[] | ✓ |
| **EvaluationEvent** | | | ✓ |
| | date | date or term string | ✓ |
| | title | string | ✓ |
| | subtitle | string | ✓ |
| | kind | enum: `Observed`, `Observing` | ✓ |
| **ObserverMatch (faculty detail)** | | | ✓ |
| | name | string | ✓ |
| | rank | string | ✓ |
| | courseLevel | string | ✓ |
| **Professor profile** | | | ✗ |
| | name | string | ✓ |
| | email | string | ✗ |
| | department | string | ✓ |
| | rank | string | ✓ |
| | instructorLevel | string | ✓ |
| | observerEligible | boolean | ✓ |
| | lastEvaluation | date | ✓ |
| | nextEvaluation | string (term: `ProfessorEvaluationStatus`.`NextDueSemester` / `NextDueYear`, e.g. `Spring 2027`) | ✓ |
| | evaluationsGivenThisYear | integer | ✓ |
| | evaluationsReceived | integer | ✓ |

---

## 4. Courses and sections

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Course** | | | ✓ |
| | code | string | ✓ |
| | title | string | ✓ |
| | sections | Section[] | ✓ |
| | history | CourseHistoryEntry[] | ✓ |
| **Section** | | | ✓ |
| | sectionName | string (up to 5 characters, e.g. `001`) | ✓ |
| | instructor | string | ✓ |
| | instructorRank | string (`CurrentLevel`) | ✓ |
| | meetingDays | string of day letters `M`, `T`, `W`, `R`, `F` (e.g. `MW`, `TR`, `MWF`) | ✓ |
| | start | time | ✓ |
| | end | time | ✓ |
| **CourseHistoryEntry** | | | ✓ |
| | term | enum: `Spring`, `Summer`, `Fall` | ✓ |
| | year | integer | ✓ |
| | instructor | string | ✓ |
| | sections | integer | ✓ |
| **Course summary** | | | ✓ |
| | term | string | ✓ |
| | courseCount | integer | ✓ |
| | sectionCount | integer | ✓ |
| **My current sections** | | | ✓ |
| | course | string | ✓ |
| | title | string | ✓ |
| | sectionName | string | ✓ |
| | meetingDays | string of day letters `M`, `T`, `W`, `R`, `F` | ✓ |
| | start | time | ✓ |
| | end | time | ✓ |
| **My teaching history** | | | ✓ |
| | semester | string | ✓ |
| | order | string | ✓ |
| | courses | string[] | ✓ |
| | sections | integer | ✓ |
| **My weekly schedule block** | | | ✓ |
| | course | string? | ✓ |
| | courseName | string? | ✓ |
| | meetingDays | string of day letters `M`, `T`, `W`, `R`, `F` | ✓ |
| | start | time | ✓ |
| | end | time | ✓ |
| **CourseBook sync request** | | | ✗ |
| | (none) | | ✗ |

---

## Observation workflow (sections 5–7)

Sections 5–7 follow one observation from start to finish:

| Step | Who | Action | Where |
|---|---|---|---|
| 1 | Observer | Signs up to observe in the cycle | 5.1 |
| 2 | Observer | Sends weekly availability and unavailable dates | 5.2 |
| 3 | Observee | Signs up to be observed: a section and preferred dates | 6.1 |
| 4 | Observee | Sees eligible observers and requests one | 6.2 |
| 5 | Coordinator | Optionally runs observer selection for the whole cycle | 6.2 |
| 6 | Observer | Accepts or declines the request | 6.3 |
| 7 | Coordinator / both | Schedules the observation (needs an accepted request) | 7.1 |
| 8 | Observer, observee | See, confirm or reschedule the session | 7.2 |
| 9 | Coordinator | Tracks every sign-up and session, and sends reminders | 7.3 |

Each field names its database column, view or table in brackets.

---

## 5. Observer setup

Before an observer can be matched to anyone in a cycle, they need an `Active` enrollment for that cycle (5.1) and weekly availability (5.2). Both are used only by `get_eligible_observers`.

### 5.1 Observer signs up to observe in the cycle

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Observer enrollment** (write; `ObserverEnrollment`) | | | ✓ |
| | professorId | integer (`ProfessorID`) | ✓ |
| | cycleId | integer (`CycleID`) | ✓ |
| | status | enum: `Active`, `Withdrawn` (`Status`; `Withdrawn` takes them out of matching) | ✓ |
| **My observer enrollment** (read) | | | ✓ |
| | cycleId | integer (`CycleID`) | ✓ |
| | status | enum: `Active`, `Withdrawn` (`Status`) | ✓ |
| | enrollmentDate | date (`EnrollmentDate`, set by the database) | ✓ |

### 5.2 Observer sends availability for matching

An observer is matched to a preferred date only when all of these hold:
- they have a weekly time range on that weekday that covers the whole class;
- they haven't marked that date unavailable;
- they aren't teaching another class at the same time.

A weekday with no range counts as unavailable.

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Observer availability** (write; replaces the observer's rows for the cycle) | | | ✓ |
| | professorId | integer (`ProfessorID`) | ✓ |
| | cycleId | integer (`CycleID`) | ✓ |
| | weeklyTimes | { weekday: `M` \| `T` \| `W` \| `R` \| `F`, start: time, end: time }[] (one `ObserverAvailability` row each; at most one range per weekday; start must be before end) | ✓ |
| | unavailableDates | date[] (one `ObserverUnavailableDate` row each) | ✓ |

---

## 6. Sign-ups and observer matching

### 6.1 Observee signs up to be observed

The observee picks one of their own sections in the cycle's term and the dates they would like to be observed.

The database rejects a sign-up if:
- the section's term isn't the cycle's term;
- the sign-up date is after `SignUpDeadLine`;
- the observee doesn't teach the section.

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **My sections available for sign-up** (read; `ProfessorCourseSchedule` view filtered to the cycle's term) | | | ✓ |
| | sectionId | integer (`SectionID`) | ✓ |
| | courseCode | string (`CourseCode`, e.g. `CS 4347`) | ✓ |
| | courseName | string (`CourseName`) | ✓ |
| | sectionName | string (`SectionName`, e.g. `001`) | ✓ |
| | meetingDays | string of day letters `M`, `T`, `W`, `R`, `F` (`MeetingDays`) | ✓ |
| | start | time (`StartTime`) | ✓ |
| | end | time (`EndTime`) | ✓ |
| **Be-observed sign-up** (write; `ObservationSignup` + `SignupPreferredDate`) | | | ✓ |
| | professorId | integer (`ObserveeProfessorID`) | ✓ |
| | cycleId | integer (`CycleID`) | ✓ |
| | sectionId | integer (`SectionID`) | ✓ |
| | preferredDates | date[] (one `SignupPreferredDate` row each; should fall on the section's meeting days, or they can't be used for matching) | ✓ |
| **Be-observed sign-up result** | | | ✓ |
| | signupId | integer (`SignupID`; used by "Request observer" in 6.2) | ✓ |
| | signupDate | date (`SignupDate`, set by the server) | ✓ |
| | signupTime | time (`SignupTime`, set by the server) | ✓ |
| **My sign-ups** (read) | | | ✓ |
| | signupId | integer (`SignupID`) | ✓ |
| | cycleId | integer (`CycleID`) | ✓ |
| | sectionId | integer (`SectionID`) | ✓ |
| | courseCode | string | ✓ |
| | sectionName | string | ✓ |
| | courseLevel | string (first digit of the course number, e.g. `4` for `CS 4347`) | ✓ |
| | preferredDates | date[] | ✓ |
| | pendingRequests | integer (`SignupObserverCoverage.PendingRequests`) | ✓ |
| | acceptedRequests | integer (`SignupObserverCoverage.AcceptedRequests`) | ✓ |

### 6.2 Finding and requesting an observer

`get_eligible_observers(signupId)` returns the observers who meet all of these conditions:
- same department as the observee;
- taught a course at the same course level in the last four Fall/Spring semesters;
- enrolled for the cycle (5.1);
- available on one of the preferred dates (5.2).

The observee requests one of them. The coordinator can also run selection for the whole cycle.

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Available observer** (read; `get_eligible_observers` + joins) | | | ✓ |
| | id | integer (`ProfessorID`) | ✓ |
| | name | string (`ProfessorName`) | ✓ |
| | rank | string (`CurrentLevel`) | ✓ |
| | teaching | string (from `TeachingAssignment`) | ✓ |
| | courseLevel | string (first digit of the course number) | ✓ |
| | available | string (from `ObserverAvailability`) | ✓ |
| | requested | boolean (an `ObserverRequest` exists for this sign-up and observer) | ✓ |
| **Request observer** (write; `ObserverRequest`, created as `Pending`) | | | ✓ |
| | signupId | integer (`SignupID`) | ✓ |
| | observerId | integer (`ObserverProfessorID`) | ✓ |
| **Run observer selection** (coordinator) | | | ✗ |
| | cycleId | integer | ✓ |

### 6.3 Observer answers an observation request

The observer sees the requests addressed to them and accepts or declines each one. Once a request is `Accepted`, an observation can be scheduled for that sign-up and observer (7.1).

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Incoming observation request** (read; `ProfessorObserverInvitations` view filtered to the observer) | | | ✓ |
| | requestId | integer (`RequestID`) | ✓ |
| | signupId | integer (`SignupID`) | ✓ |
| | observeeName | string (`ObserveeName`) | ✓ |
| | courseCode | string (`CourseCode`) | ✓ |
| | courseName | string (`CourseName`) | ✓ |
| | sectionName | string (`SectionName`) | ✓ |
| | meetingDays | string of day letters `M`, `T`, `W`, `R`, `F` (`MeetingDays`) | ✓ |
| | start | time (`StartTime`) | ✓ |
| | end | time (`EndTime`) | ✓ |
| | preferredDates | date[] (`SignupPreferredDate` for the sign-up) | ✓ |
| | requestDate | date (`RequestDate`) | ✓ |
| | expirationDate | date (`ExpirationDate`) | ✓ |
| | expirationTime | time (`ExpirationTime`) | ✓ |
| | status | enum: `Pending`, `Accepted`, `Declined` (`RequestStatus`) | ✓ |
| **Answer request** (write; updates `ObserverRequest.Status`) | | | ✓ |
| | requestId | integer (`RequestID`) | ✓ |
| | status | enum: `Accepted`, `Declined` | ✓ |

---

## 7. Observation sessions

### 7.1 Scheduling an observation

The schedule request names a sign-up and one of its accepted observers. The course, section and observee all come from the sign-up. The API sets `ObserveeID` from the sign-up, `TemplateID` from the cycle, and `Status` to `Scheduled`.

The database creates an `Observation` row only when all of these hold:
- an observer request for that sign-up and observer is `Accepted`;
- the observee matches the sign-up's observee;
- the date is on or before the cycle's `ObservationDeadLine`;
- the template is the cycle's template.

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Schedule evaluation** (write; `Observation`) | | | ✓ |
| | signupId | integer (`SignupID`) | ✓ |
| | observerId | integer (`ObserverProfessorID`; must have an `Accepted` request for the sign-up) | ✓ |
| | date | date (`ScheduledDate`) | ✓ |
| | start | time (`ScheduledTime`; defaults to the section's `StartTime`) | ✓ |

### 7.2 My upcoming sessions

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **My upcoming session** (read; `ProfessorObservationDashboard` view) | | | ✗ |
| | id | integer (`ObservationID`) | ✓ |
| | date | date (`ScheduledDate`) | ✓ |
| | kind | enum: `Being observed`, `Observing` | ✓ |
| | otherProfessor | string (`ObserveeName` / `ObserverName`) | ✓ |
| | course | string (`CourseCode`) | ✓ |
| | section | string (`SectionName`) | ✓ |
| | start | time (`ScheduledTime`) | ✓ |
| | end | time (always the section's `EndTime`) | ✓ |
| | room | string? | ✗ |
| | confirmed | boolean | ✗ |
| | reportDue | date? | ✗ |
| **Confirm session** | | | ✗ |
| | sessionId | integer | ✓ |
| **Reschedule / propose new time** | | | ✗ |
| | sessionId | integer | ✓ |
| | date | date | ✓ |
| | start | time | ✓ |
| | end | time (always the section's `EndTime`, so it can't be changed here) | ✓ |

### 7.3 Coordinator tracking

One row for each sign-up in the cycle, whether or not it has been matched or scheduled yet.

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Coordinator evaluation row** | | | ✗ |
| | id | integer | ✓ |
| | faculty | string | ✓ |
| | courseLevel | string (first digit of the observed course's number, e.g. `1` for `CS 1337`, `4` for `CS 4347`; both professors must have taught this level) | ✓ |
| | observer | string? | ✓ |
| | session | string | ✓ |
| | due | date (`ObservationDeadLine`) | ✓ |
| | status | enum: `Overdue`, `Report overdue`, `Unmatched`, `Pending`, `Confirmed` | ✗ |
| | reminded | boolean | ✗ |
| **Send reminder** | | | ✗ |
| | observationId | integer (`ObservationID`; reminders are only sent for `Overdue` and `Report overdue` rows, which always have an observation) | ✓ |
| | professorId | integer | ✓ |


---

## 8. Observation reports

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Report form context** | | | ✗ |
| | sessionId | integer | ✓ |
| | observee | string | ✓ |
| | observer | string | ✓ |
| | course | string | ✓ |
| | section | string | ✓ |
| | date | date | ✓ |
| | start | time | ✓ |
| | end | time (always the section's `EndTime`) | ✓ |
| | room | string? | ✗ |
| | semester | string | ✓ |
| | criteria | Criterion[] | ✓ |
| | ratingScale | RatingLevel[] | ✗ |
| **Report draft / submission** | | | ✗ |
| | sessionId | integer | ✓ |
| | courseTitle | string | ✓ |
| | date | date | ✓ |
| | ratings | { criterionId: integer `1`–`6` (`6` = N/A) } | ✓ |
| | notes | { criterionId: { practice: string, growth: string } } | ✗ |
| | strengths | string | ✗ |
| | growth | string | ✗ |
| | confirmed | boolean | ✗ |
| | signature | string | ✗ |
| | signedAt | date | ✗ |
| | status | enum: `draft`, `awaitingObservee`, `complete` | ✗ |
| | savedAt | datetime | ✗ |
| **Observee sign-off** | | | ✗ |
| | reportId | integer | ✓ |
| | acknowledged | boolean | ✗ |
| | signature | string | ✗ |
| | signedAt | date | ✗ |
| | response | string? | ✗ |
| **Report PDF** | | | ✓ |
| | reportId(s) or professorId | integer / integer[] | ✓ |
| **My evaluation log entry** | | | ✗ |
| | id | integer | ✓ |
| | date | date | ✓ |
| | type | enum: `Observing`, `Observed` | ✓ |
| | withCourse | string | ✓ |
| | outcome | string? | ✗ |
| | status | enum: `Report submitted`, `Report received`, `Closed` | ✗ |
| | reportId | integer? | ✓ |
| **My evaluation requirement** | | | ✗ |
| | observationsReceived | integer | ✓ |
| | frequency | string (from `ProfessorEvaluationStatus`.`FrequencyYears`, e.g. `Every 2 years`) | ✓ |
| | nextDue | string (`ProfessorEvaluationStatus`.`NextDueSemester` / `NextDueYear`, e.g. `Spring 2027`) | ✓ |
| | cycle | string (from `ProfessorEvaluationStatus`.`FrequencyYears`) | ✓ |

---

## 9. Evaluation criteria

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Criteria section** | | | ✓ |
| | id | integer | ✓ |
| | templateId | integer | ✓ |
| | name | string (up to 100 characters) | ✓ |
| | order | integer | ✓ |
| **Criterion** | | | ✓ |
| | id | integer | ✓ |
| | templateId | integer | ✓ |
| | sectionId | integer | ✓ |
| | order | integer | ✓ |
| | name | string (up to 100 characters) | ✓ |
| | description | string | ✓ |
| | points | string[] | ✓ |
| | guidance | string | ✓ |
| | appliesTo | enum: `All`, `In person`, `Online / Hybrid` | ✓ |
| | usedIn | integer | ✓ |
| | active | boolean | ✓ |
| | required | boolean | ✓ |
| | notesOnLowRating | boolean | ✓ |
| **RatingLevel** | | | ✗ |
| | value | integer `1`–`6` (`6` = N/A) | ✓ |
| | label | string | ✗ |
| | tone | enum: `green`, `orange`, `neutral` | ✗ |
| **Observation template** | | | ✓ |
| | templateId | integer | ✓ |
| | templateVersion | string | ✓ |
| | isActive | boolean | ✓ |
| | isLocked | boolean (set by the database when the first observation using the template is completed; cannot be unlocked) | ✓ |
| | lastUpdated | datetime | ✓ |
| | activeCount | integer | ✓ |
| | sectionCount | integer | ✓ |

---

## 10. Dashboard and Evaluations statistics

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **KPI card** | | | ✗ |
| | label | string | ✗ |
| | value | string / number | ✗ |
| | detail | string | ✗ |
| | accent | enum: `green`, `red`, `black`, `orange` | ✗ |
| | detailPositive | boolean? | ✗ |
| **Eligibility accuracy (KPI 1.1)** | | | ✗ |
| | correct | integer | ✗ |
| | flaggedEarly | integer | ✗ |
| | missed | integer | ✗ |
| **Overdue evaluations (KPI 1.2)** | | | ✗ |
| | count | integer (`ProfessorEvaluationStatus`.`EvaluationStatus` = `Overdue`) | ✓ |
| | changeThisWeek | integer | ✗ |
| **Participation (KPI 2.1)** | | | ✗ |
| | participating | integer | ✓ |
| | totalFaculty | integer | ✓ |
| | byLevel | { level: string (`CurrentLevel`), participating: integer, total: integer }[] | ✓ |
| | target | number | ✗ |
| **Observer utilization (KPI 2.2)** | | | ✓ |
| | assigned | integer | ✓ |
| | available | integer | ✓ |
| **Avg. observations per observer (KPI 2.3)** | | | ✓ |
| | average | number | ✓ |
| | totalAssigned | integer | ✓ |
| **Faculty due by hire level** | | | ✓ |
| | level | string (`CurrentLevel`) | ✓ |
| | count | integer (`ProfessorEvaluationStatus`.`EvaluationStatus` = `Due`) | ✓ |
| **Cycle summary** | | | ✓ |
| | facultyDue | integer (`ProfessorEvaluationStatus`.`EvaluationStatus` = `Due`) | ✓ |
| | overdue | integer (`ProfessorEvaluationStatus`.`EvaluationStatus` = `Overdue`) | ✓ |
| | unmatched | integer | ✓ |
| | totalEvaluations | integer | ✓ |
| **Cycle completion** | | | ✓ |
| | segment | enum: `Completed`, `Scheduled` (`Observation.Status`), `Overdue` (not `Completed` after `ObservationDeadLine`), `Unmatched` (sign-up with no accepted request) | ✓ |
| | count | integer | ✓ |
| **Observer workload bucket** | | | ✓ |
| | assigned | enum: `0`, `1`, `2`, `3`, `4+` | ✓ |
| | observers | integer | ✓ |
| **Export report** | | | ✓ |
| | cycleId | integer | ✓ |

---

## 11. Settings

Only the Cycle settings are stored in the database (`EvaluationCycle`). None of the others are.

| Data | Field | Type | Database Matches |
|---|---|---|---|
| **Committee settings: Evaluation Policy** | | | ✗ |
| | assistantCycle | enum: `Every semester (Fall & Spring)`, `Every year`, `Every 2 years`, `Every 3 years` | ✗ |
| | associateCycle | same enum | ✗ |
| | fullCycle | same enum | ✗ |
| | lecturerCycle | same enum | ✗ |
| | minSignups | integer (1–3) | ✗ |
| | skipFirstSemester | boolean | ✗ |
| | levelRule | enum: `Same level`, `Same or higher`, `Strictly higher` | ✗ |
| | topLevelPeers | boolean | ✗ |
| | eligibilityBasis | enum: `Hire date`, `Program start` | ✗ |
| | levelsInScope | enum[]: `1000s`–`6000s` | ✗ |
| **Committee settings: Observer Matching** | | | ✗ |
| | minRecommendations | integer (1–5) | ✗ |
| | maxRecommendations | enum: 3, 5, 7, 10 | ✗ |
| | levelAssignment | enum: `Highest course taught`, `Most sections taught`, `Manual` | ✗ |
| | balanceLoad | boolean | ✗ |
| | unmatchedAfter | enum: `Immediately`, `3 days`, `7 days`, `14 days` | ✗ |
| | crossDepartment | boolean | ✗ |
| **Committee settings: Cycle** | | | ✓ |
| | currentCycle | cycle id / label | ✓ |
| | signupDeadline | date | ✓ |
| | observationDeadline | date | ✓ |
| **Committee settings: Dashboard & Lists** | | | ✗ |
| | upcomingWindow | enum: 7, 14, 30 (days) | ✗ |
| | facultyFilter | enum: `Due this cycle`, `Overdue`, `Unmatched`, `Needs observer`, `All faculty` | ✗ |
| | facultySort | enum: `Next evaluation`, `Name`, `Level`, `Status` | ✗ |
| | rowsPerPage | enum: 12, 25, 50 | ✗ |
| **Committee settings: Data Sources** | | | ✗ |
| | keepCourseCorrections | boolean | ✗ |
| **Committee settings: Notifications** | | | ✗ |
| | notifySignup | { email: boolean, inApp: boolean } | ✗ |
| | notifyReportSigned | { email: boolean, inApp: boolean } | ✗ |
| | notifyPullFailure | { email: boolean, inApp: boolean } | ✗ |
| | deadlineNotice | enum: `On the day it opens`, `3 days before`, `7 days before`, `14 days before` | ✗ |
| | weeklyDigest | enum: `Off`, `Monday, 8:00 AM`, `Monday, 12:00 PM`, `Friday, 8:00 AM`, `Friday, 3:00 PM` | ✗ |
| **Faculty settings: Profile** | | | ✗ |
| | displayName | string | ✗ |
| | title | string | ✗ |
| | contactEmail | string | ✗ |
| **Faculty settings: Schedule** | | | ✗ |
| | scheduleView | enum: `Day`, `Week`, `Month` | ✗ |
| | weekStart | enum: `Sun`, `Mon` | ✗ |
| | dayStart | string (hour) | ✗ |
| | dayEnd | string (hour) | ✗ |
| | timeZone | enum: `America/Chicago (CT)`, `America/New_York (ET)`, `America/Denver (MT)`, `America/Los_Angeles (PT)` | ✗ |
| | showOfficeHours | boolean | ✗ |
| | showObserving | boolean | ✗ |
| **Faculty settings: Notifications** | | | ✗ |
| | notifyObserverRequest | { email: boolean, inApp: boolean } | ✗ |
| | notifyAwaitingConfirmation | { email: boolean, inApp: boolean } | ✗ |
| | notifyConfirmed | { email: boolean, inApp: boolean } | ✗ |
| | deadlineReminder | enum (same as deadlineNotice) | ✗ |
| | notifyDeadline | { email: boolean, inApp: boolean } | ✗ |
| | notifyOverdue | { email: boolean, inApp: boolean } | ✗ |
| | weeklyDigest | enum (same as committee weeklyDigest) | ✗ |

---

## To Fix

Places where the frontend requirements above and the current database (`Databasing/` on `Attempting-to-Connect-With-Front`) still disagree. Each one needs a decision or a schema change before the related page can be wired up.

### Cycle start date
- **Frontend:** `Current cycle.startDate`.
- **Database:** `EvaluationCycle` has no start date.
- **Needed:** add `StartDate DATE` to `EvaluationCycle`, or derive it.

### Post-observation and app feedback deadlines
- **Database:** `EvaluationCycle.PostObservationFeedbackDeadLine` and `AppFeedbackDeadLine` are both `NOT NULL`. CHECK constraints tie them to `ObservationDeadLine`.
- **Frontend:** neither deadline appears anywhere. "Update deadlines" only sends `signupDeadline` and `observationDeadline`, so a cycle created from the frontend would fail on these columns.
- **Needed:** either add both deadlines to the cycle settings and deadlines screens, or make the columns nullable or give them defaults.

### CourseBook sync status
- **Frontend:** `Sync status` (`lastSyncedAt`, `lastCourseBookPull`, `lastPullSucceeded`) and the "CourseBook sync request" action.
- **Database:** no sync log table. `NebulaLabsIntegration/ingest.py` imports Department, AcademicTerm, Courses, Sections, Professors and TeachingAssignment, but it runs from the command line and records nothing about its runs.
- **Needed:** a sync log table (run time, source, succeeded, message) that the import writes to, and a way for the API to start the import.

### Faculty email
- **Frontend:** `email` on the faculty list row, and the professor profile.
- **Database:** `Professors` has no email column. The only email column is in the `Users` table, which is commented out.
- **Needed:** an email column on `Professors`, or a restored `Users` table linked to `Professors`.

### Faculty level
- **Frontend:** every level and rank field reads `Professors.CurrentLevel` as a string. The pages still display their own labels (`Assistant Prof.` on the faculty list, `Assistant` on the dashboard), so they must map the stored values to those labels.
- **Database:**
  - `Professors.CurrentLevel` is a `VARCHAR(30)` with no CHECK constraint.
  - The seed data and `ProfessorEvaluationStatus` use `Assistant Professor`, `Associate Professor`, `Full Professor`.
  - The `FacultyEvaluationDue` view compares against `Assistant`, `Associate`, `Full`, so its `IsDue` is `NULL` for every seeded professor.
  - No lecturer handling exists.
- **Needed:**
  - One agreed set of stored values, enforced with a CHECK constraint, that includes Lecturer.
  - `FacultyEvaluationDue` updated to use the same values, or dropped in favor of `ProfessorEvaluationStatus`.

### Next evaluation
- **Frontend:** `Faculty detail.nextEvaluation` and `Professor profile.nextEvaluation` show the next due term (semester and year). No due month is needed.
- **Database:**
  - `ProfessorEvaluationStatus` (`ProfEvalStat.sql`) returns `FrequencyYears`, `NextDueYear`, `NextDueSemester` and `EvaluationStatus` (`Due`, `Overdue`, `Not Due`, `Unknown`). Faculty status, evaluation cycle, next due term and the due/overdue counts all come from it.
  - The intervals are hardcoded in the view (1 year for assistant, 2 for associate and full). Nothing stores them, and lecturers always get `Unknown`.
  - `NextDueSemester` is the semester of the last completed evaluation, and `NextDueYear` adds the interval to its year. An evaluation completed in June or July gets no `NextDueSemester`.
- **Needed:**
  - Stored evaluation intervals for each level, including Lecturer.
  - A rule for evaluations completed in June or July (for example, count them as Spring).

### ID generation
- **Frontend:** "Be-observed sign-up" creates a sign-up and needs its new `signupId` back, because "Request observer" requires it. "Request observer" and "Schedule evaluation" also create rows.
- **Database:** `ObservationSignup.SignupID`, `ObserverRequest.RequestID` and `Observation.ObservationID` are plain `INT PRIMARY KEY` columns with no identity or sequence, so the database does not create IDs. The seed data writes them by hand.
- **Needed:** make all three `GENERATED ALWAYS AS IDENTITY`, as `EvaluationCriterionSection.SectionID` already is. Otherwise the API has to pick IDs itself, and two rows saved at the same moment could get the same ID.

### Coordinator evaluation status view
- **Frontend:** `Coordinator evaluation row.status` is `Overdue`, `Report overdue`, `Unmatched`, `Pending` or `Confirmed`.
- **Database:** `Observation.Status` only holds `Scheduled` / `Completed`.
  - `Unmatched` and `Pending` describe sign-ups that have no observation row yet.
  - `Confirmed` and `Report overdue` have no columns behind them.
- **Needed:** a view that combines sign-ups without observations with observations, and calculates the status column above.

### Session confirmation
- **Frontend:** `My upcoming session.confirmed` and the "Confirm session" action.
- **Database:** no confirmation column on `Observation`.
- **Needed:** confirmation flags (observer and/or observee) or a status value for confirmed.

### Observation room
- **Frontend:** sessions and the report form show `room`. (`end` always comes from the section's `EndTime`.)
- **Database:** neither `Observation` nor `Sections` has a room.
- **Needed:** a room on `Sections`, or one for each observation.

### Reschedule proposals
- **Frontend:** "Reschedule / propose new time" sends `sessionId`, `date`, `start`. The end time always comes from the section, so a proposal can't change it.
- **Database:** the only option is overwriting `ScheduledDate` / `ScheduledTime`. The proposal, who made it, and whether the other side accepted are not stored.
- **Needed:** a reschedule proposal table (session, proposed by, date, start, end, status).

### Reminder emails
- **Frontend:** "Send reminder" (`observationId`, `professorId`), and the `reminded` flag on the coordinator evaluation row.
- **Database:** nothing stores sent reminders, and nothing sends email.
- **Needed:** a reminder table (observation, professor, sent at) and the email sending behind it.

### Report deadline
- **Frontend:** `My upcoming session.reportDue`, and the `Report overdue` status.
- **Database:** no report deadline. `PostObservationFeedbackDeadLine` belongs to the post-observation survey, not the report.
- **Needed:** a report deadline, either a cycle column or a fixed number of days after the observation.

### Available observer details
- **Frontend:** `Available observer` shows `rank`, `teaching`, `available` and `requested`.
- **Database:**
  - `get_eligible_observers(signupId)` returns only `ProfessorID` and `ProfessorName`.
  - The other fields have to be joined in separately:
    - `rank` from `Professors.CurrentLevel`;
    - `teaching` from `TeachingAssignment`;
    - `available` from `ObserverAvailability`;
    - `requested` from `ObserverRequest`.
- **Needed:** widen the function's return columns, or build a view on top of it, so the API doesn't have to join four tables for each observer.
- **Note:** Prof. Priya thinks giving the observee more information about the observer is a good thing, so this should keep the extra fields rather than drop them.

### Report status and the completed-report lock
- **Frontend:** the report moves `draft` → `awaitingObservee` (observer has signed) → `complete` (observee has signed).
- **Database:**
  - `Observation.Status` only uses `Scheduled` / `Completed`.
  - `protect_completed_observation` blocks every change once the status is `Completed`.
  - `protect_completed_ratings` freezes the ratings at the same point.
- **Problem:** if `Completed` marks the observer's submission, the observee's sign-off can never be saved. If it marks the observee's sign-off, nothing stops edits while the report is `awaitingObservee`.
- **Needed:**
  - Status values that match the three frontend stages.
  - A lock that freezes ratings and content once the observer submits, but still allows the observee's sign-off to be saved.

### Report content fields
- **Frontend:** `Report draft / submission` needs:
  - per-criterion `notes.practice` and `notes.growth`;
  - `strengths`, `growth`, `confirmed`, `signature`, `signedAt` and `savedAt`;
  - `outcome` (`Exceeds expectations`, `Meets expectations`, `Needs improvement`).
- **Database:**
  - `ObservationCriterionRating` has one `Comments` field per criterion.
  - `Observation` has one `Notes` field.
  - None of the other fields exist.
- **Needed:**
  - Split `Comments` into practice and growth notes.
  - Add strengths, growth, the observer's signature, signed-at, saved-at and outcome to `Observation`.

### Observee sign-off
- **Frontend:** `Observee sign-off` sends `reportId`, `acknowledged`, `signature`, `signedAt`, `response?`.
- **Database:** only `Observation.Signee`, a name string.
- **Needed:** columns or a sign-off table for acknowledgement, signature, signed-at and the observee's response. A separate table also avoids the completed-report lock above.

### Criterion section required
- **Frontend:** every `Criterion` has a `sectionId`.
- **Database:** `EvaluationCriterion.SectionID` is nullable, and the seed criteria have no section.
- **Needed:** give the seed criteria sections, then make `SectionID` `NOT NULL`.

---

## Missing Backend Routes

Data rows marked ✓ above that the database supports but the backend (`backend/app/api/`) has no working route for. The frontend can't load or save them until these routes exist.

### Observer enrollment (5.1)
- **Frontend:** `Observer enrollment` (write) and `My observer enrollment` (read).
- **Backend:** no route reads or writes `ObserverEnrollment`.
- **Needed:** a route to enroll or withdraw an observer for a cycle, and one to read the observer's enrollment.

### Observer availability (5.2)
- **Frontend:** `Observer availability` (write): `weeklyTimes` and `unavailableDates`.
- **Backend:** no route writes `ObserverAvailability` or `ObserverUnavailableDate`.
- **Needed:** a route that replaces the observer's availability rows for a cycle.

### Request observer (6.2)
- **Frontend:** `Request observer` (`signupId`, `observerId`).
- **Backend:** `POST /api/observer-requests` is declared in `observer_requests.py`, but its body is `...`, so it creates nothing and returns `null`.
- **Needed:** an implementation that inserts a `Pending` `ObserverRequest`.

### Incoming observation requests (6.3)
- **Frontend:** `Incoming observation request` (read).
- **Backend:** `GET /api/observer-requests` and `GET /api/observer-requests/accepted` are declared but empty, so they return `null`.
- **Needed:** an implementation that reads `ProfessorObserverInvitations` for the observer, with the sign-up's preferred dates.

### Answer request (6.3)
- **Frontend:** `Answer request` (`requestId`, `status`).
- **Backend:** no route updates `ObserverRequest.Status`. (`POST /api/signups/{signup_id}/select-observer` is declared but empty, and it is for the observee choosing an observer, not the observer answering.)
- **Needed:** a route that sets a request to `Accepted` or `Declined`.

### Schedule evaluation (7.1)
- **Frontend:** `Schedule evaluation` (`signupId`, `observerId`, `date`, `start`).
- **Backend:** no route creates an `Observation`.
- **Needed:** a route that inserts the `Observation`, taking the observee from the sign-up and the template from the cycle.

### Faculty detail events and matches (3)
- **Frontend:** `Faculty detail.pastEvents`, `upcomingEvents`, `theyCanObserve`, and the `EvaluationEvent` and `ObserverMatch (faculty detail)` rows.
- **Backend:** no route returns a professor's observations (as observer or observee) or the professors they can observe. `GET /api/signups/{signup_id}/eligible-observers` goes the other way: the observers for one sign-up.
- **Needed:** a route for a professor's observation history and upcoming observations, and one for the observees they are eligible to observe.

### Course history (4)
- **Frontend:** `Course.history` (`CourseHistoryEntry`: term, year, instructor, sections).
- **Backend:** `GET /api/courses` and `GET /api/courses/{course_id}` only return the current term's sections.
- **Needed:** a route (or a field on `GET /api/courses/{course_id}`) with the course's past terms, instructors and section counts.

### Report PDF (8)
- **Frontend:** `Report PDF` (report ids or a professor id).
- **Backend:** no report routes at all.
- **Needed:** a route that builds and returns the PDF.

### Evaluation criteria (9)
- **Frontend:** `Criteria section`, `Criterion` and `Observation template`.
- **Backend:** no route reads or writes `EvaluationCriterionSection`, `EvaluationCriterion` or `ObservationTemplate`.
- **Needed:** routes to list and edit a template's sections and criteria, and to read the template (version, active, locked, counts).

### Dashboard and Evaluations statistics (10)
- **Frontend:** `Observer utilization`, `Avg. observations per observer`, `Cycle completion`, `Observer workload bucket`, `Export report`, and `Cycle summary.unmatched` / `totalEvaluations`.
- **Backend:** no statistics routes. (`Faculty due by hire level` and `Cycle summary.facultyDue` / `overdue` can be counted from `GET /api/evaluation-status`.)
- **Needed:** routes that return these counts for a cycle, and one that exports the cycle report.
