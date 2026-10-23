--Professor department check
SELECT
    p.ProfessorName,
    p.CurrentLevel,
    d.DepartmentName
FROM Professors p
JOIN Department d
    ON p.ProfessorDepartment = d.DepartmentID;

--Professor Course Section Term
SELECT
    p.ProfessorName,
    c.CourseCode,
    c.CourseName,
    s.SectionName,
    t.Semester,
    t.YearNum
FROM TeachingAssignment ta
JOIN Professors p
    ON ta.ProfessorID = p.ProfessorID
JOIN Sections s
    ON ta.SectionID = s.SectionID
JOIN Courses c
    ON s.CourseID = c.CourseID
JOIN AcademicTerm t
    ON s.TermID = t.TermID
ORDER BY p.ProfessorName;

--Eval Cycle signup Professor Section
SELECT
    ec.CycleID,
    t.Semester,
    t.YearNum,
    p.ProfessorName AS Observee,
    c.CourseCode,
    s.SectionName,
    os.Status
FROM ObservationSignup os
JOIN EvaluationCycle ec
    ON os.CycleID = ec.CycleID
JOIN AcademicTerm t
    ON ec.TermID = t.TermID
JOIN Professors p
    ON os.ObserveeProfessorID = p.ProfessorID
JOIN Sections s
    ON os.SectionID = s.SectionID
JOIN Courses c
    ON s.CourseID = c.CourseID;

--Signup Observer request observer
SELECT
    os.SignupID,
    observee.ProfessorName AS Observee,
    observer.ProfessorName AS Observer,
    orq.Status AS RequestStatus,
    orq.ExpirationDate,
    orq.ExpirationTime
FROM ObserverRequest orq
JOIN ObservationSignup os
    ON orq.SignupID = os.SignupID
JOIN Professors observee
    ON os.ObserveeProfessorID = observee.ProfessorID
JOIN Professors observer
    ON orq.ObserverProfessorID = observer.ProfessorID;

--Complete Observation History
SELECT
    o.ObservationID,
    observee.ProfessorName AS Observee,
    observer.ProfessorName AS Observer,
    c.CourseCode,
    c.CourseName,
    o.ScheduledDate,
    o.ScheduledTime,
    ot.TemplateVersion,
    o.Status,
    o.Notes
FROM Observation o
JOIN ObservationSignup os
    ON o.SignupID = os.SignupID
JOIN Professors observee
    ON o.ObserveeID = observee.ProfessorID
JOIN Professors observer
    ON o.ObserverProfessorID = observer.ProfessorID
JOIN Sections s
    ON os.SectionID = s.SectionID
JOIN Courses c
    ON s.CourseID = c.CourseID
JOIN ObservationTemplate ot
    ON o.TemplateID = ot.TemplateID;

--Final Survey Connection
SELECT
    sr.SurveyResponseID,
    p.ProfessorName,
    ec.CycleID,
    sr.Role,
    sr.ProcessStatus,
    sr.Difficulties,
    sr.ImprovementConditions
FROM PostObservationSurveyResponse sr
JOIN Professors p
    ON sr.ProfessorID = p.ProfessorID
JOIN EvaluationCycle ec
    ON sr.CycleID = ec.CycleID
JOIN ObservationSignup os
    ON sr.SignupID = os.SignupID;

--EDGE CASES
--Courses with no professors
SELECT
    s.SectionID,
    s.SectionName,
    c.CourseCode
FROM Sections s
JOIN Courses c
    ON s.CourseID = c.CourseID
LEFT JOIN TeachingAssignment ta
    ON s.SectionID = ta.SectionID
WHERE ta.SectionID IS NULL;

--Professors with no teaching assignment
SELECT
    p.ProfessorID,
    p.ProfessorName
FROM Professors p
LEFT JOIN TeachingAssignment ta
    ON p.ProfessorID = ta.ProfessorID
WHERE ta.ProfessorID IS NULL;

--Signups with no observer requests
SELECT
    os.SignupID,
    p.ProfessorName AS Observee
FROM ObservationSignup os
JOIN Professors p
    ON os.ObserveeProfessorID = p.ProfessorID
LEFT JOIN ObserverRequest orq
    ON os.SignupID = orq.SignupID
WHERE orq.SignupID IS NULL;



-- AHC-215 Get every professor's last completed evaluation date
SELECT
    p.ProfessorID,
    p.ProfessorName,
    MAX(o.CompletedDate) AS LastEvaluationDate
FROM Professors p
LEFT JOIN Observation o
    ON p.ProfessorID = o.ObserveeID
    AND o.Status = 'Completed'
    AND o.CompletedDate IS NOT NULL
GROUP BY
    p.ProfessorID,
    p.ProfessorName
ORDER BY
    p.ProfessorName;

--Signups where professor doesn't teach the section
SELECT
    os.SignupID,
    p.ProfessorName AS Observee,
    c.CourseCode,
    s.SectionName
FROM ObservationSignup os
JOIN Professors p
    ON p.ProfessorID = os.ObserveeProfessorID
JOIN Sections s
    ON s.SectionID = os.SectionID
JOIN Courses c
    ON c.CourseID = s.CourseID
LEFT JOIN TeachingAssignment ta
    ON ta.ProfessorID = os.ObserveeProfessorID
   AND ta.SectionID = os.SectionID
WHERE ta.ProfessorID IS NULL;

-- Observations whose observee doesnt't match the signup
SELECT
    o.ObservationID,
    o.SignupID,
    o.ObserveeID AS ObservationObservee,
    os.ObserveeProfessorID AS SignupObservee
FROM Observation o
JOIN ObservationSignup os
    ON os.SignupID = o.SignupID
WHERE o.ObserveeID <> os.ObserveeProfessorID;

-- Observation Criterion does not belong to the template
SELECT
    o.ObservationID,
    o.TemplateID AS ObservationTemplate,
    ecr.CriterionID,
    ec.TemplateID AS CriterionTemplate
FROM ObservationCriterionRating ecr
JOIN Observation o
    ON o.ObservationID = ecr.ObservationID
JOIN EvaluationCriterion ec
    ON ec.CriterionID = ecr.CriterionID
WHERE o.TemplateID <> ec.TemplateID;

-- Signups whose section term differs from the cycle term
SELECT os.SignupID
FROM ObservationSignup os
JOIN EvaluationCycle ec ON ec.CycleID = os.CycleID
JOIN Sections s ON s.SectionID = os.SectionID
WHERE s.TermID <> ec.TermID;

-- Signups with no eligible observers
SELECT
    os.SignupID,
    os.ObserveeProfessorID,
    COUNT(e.ProfessorID) AS EligibleCount
FROM ObservationSignup os
LEFT JOIN LATERAL
    get_eligible_observers(os.SignupID) e
    ON TRUE
GROUP BY
    os.SignupID,
    os.ObserveeProfessorID
HAVING COUNT(e.ProfessorID) = 0;

-- Randomly select up to 5 eligible observers
SELECT *
FROM get_eligible_observers(1)
ORDER BY RANDOM()
LIMIT 5;

-- Count eligibile observers for every signup
SELECT
    os.SignupID,
    COUNT(e.ProfessorID) AS EligibleCount
FROM ObservationSignup os
LEFT JOIN LATERAL
    get_eligible_observers(os.SignupID) e
    ON TRUE
GROUP BY os.SignupID
ORDER BY os.SignupID;

-- Eval cycle Info Query
SELECT
    ec.CycleID,
    ec.TermID,
    t.Semester,
    t.YearNum,
    ec.SignUpDeadLine,
    ec.ObservationDeadLine,
    ec.PostObservationFeedbackDeadLine,
    ec.AppFeedbackDeadLine
FROM EvaluationCycle ec
JOIN AcademicTerm t
    ON t.TermID = ec.TermID
WHERE ec.CycleID = 1;

-- Course overview for the selected term
SELECT *
FROM CourseOverview
WHERE TermID = 1
ORDER BY CourseCode;

-- Problematic signups (0 eligible observers)
SELECT *
FROM SignupObserverCoverage
WHERE EligibleCount = 0;

-- filtering by cycle
SELECT *
FROM SignupObserverCoverage
WHERE CycleID = 1;

-- Current Pending Observations
SELECT *
FROM ProfessorObserverInvitations
WHERE ObserverProfessorID = 3
  AND RequestStatus = 'Pending'
ORDER BY RequestDate DESC;

--Upcoming Observations
SELECT *
FROM ProfessorObservationDashboard
WHERE ObserveeID = 3
  AND ScheduledDate >= CURRENT_DATE
  AND ObservationStatus <> 'Completed'
ORDER BY ScheduledDate, ScheduledTime;

--Completed Observations
SELECT *
FROM ProfessorObservationDashboard
WHERE ObserveeID = 3
  AND ObservationStatus = 'Completed'
ORDER BY CompletedDate DESC;

-- Course Schedule for Profs
SELECT *
FROM ProfessorCourseSchedule
WHERE ProfessorID = 3
ORDER BY YearNum DESC, Semester, CourseCode;

-- CourseSectionDetailing
SELECT *
FROM CourseSectionDetails
WHERE CourseID = 3
  AND TermID = 1
ORDER BY SectionName, ProfessorName;

--Example Query for Professor's history
SELECT *
FROM CourseInstructorHistory
WHERE CourseID = 3
ORDER BY
    YearNum DESC,
    CASE Semester
        WHEN 'Fall' THEN 3
        WHEN 'Summer' THEN 2
        WHEN 'Spring' THEN 1
    END DESC;

-- Observer workloads for evaluation cycle 1
SELECT *
FROM ObserverWorkload
WHERE CycleID = 1
ORDER BY AssignedObservations DESC;

-- KPI Completion Stats
-- Observation status totals for a cycle
SELECT
    o.Status,
    COUNT(*) AS ObservationCount
FROM Observation o
JOIN ObservationSignup os
    ON os.SignupID = o.SignupID
WHERE os.CycleID = 1
GROUP BY o.Status
ORDER BY ObservationCount DESC;

--Faculty count by acadmic level
SELECT
    CurrentLevel,
    COUNT(*) AS FacultyCount
FROM Professors
GROUP BY CurrentLevel
ORDER BY CurrentLevel;

--Faculty Due by academic level
SELECT
    CurrentLevel,
    COUNT(*) AS FacultyDue
FROM FacultyEvaluationDue
WHERE CycleID = 1
  AND IsDue = TRUE
GROUP BY CurrentLevel
ORDER BY CurrentLevel;

--Specific professors due
SELECT
    ProfessorID,
    ProfessorName,
    CurrentLevel,
    LastEvaluationYear,
    RequiredIntervalYears
FROM FacultyEvaluationDue
WHERE CycleID = 1
  AND IsDue = TRUE
ORDER BY CurrentLevel, ProfessorName;

--Faculty who have never completed an observation
SELECT
    ProfessorID,
    ProfessorName,
    CurrentLevel
FROM FacultyEvaluationDue
WHERE CycleID = 1
  AND LastEvaluationYear IS NULL
  AND IsDue = TRUE;

--All professors enrolled to observe in Cycle 1
SELECT
    p.ProfessorID,
    p.ProfessorName,
    oe.EnrollmentDate,
    oe.Status
FROM ObserverEnrollment oe
JOIN Professors p
    ON p.ProfessorID = oe.ProfessorID
WHERE oe.CycleID = 1
ORDER BY p.ProfessorName;

-- Observers enrolled but missing weekday availability
SELECT
    p.ProfessorID,
    p.ProfessorName,
    oe.CycleID,
    oe.EnrollmentDate,
    oe.Status
FROM ObserverEnrollment oe
JOIN Professors p
    ON p.ProfessorID = oe.ProfessorID
WHERE oe.Status = 'Active'
  AND NOT EXISTS (
      SELECT 1
      FROM ObserverAvailability oa
      WHERE oa.ProfessorID = oe.ProfessorID
        AND oa.CycleID = oe.CycleID
  )
ORDER BY p.ProfessorName;


-- Active evaluation criteria for a template
SELECT
    ec.CriterionID,
    ec.CriterionName,
    ec.Description,
    ec.DisplayOrder,
    ecs.SectionName,
    ec.IsRequired
FROM EvaluationCriterion ec
LEFT JOIN EvaluationCriterionSection ecs
    ON ecs.SectionID = ec.SectionID
WHERE ec.TemplateID = 1
  AND ec.IsActive = TRUE
ORDER BY
    ecs.DisplayOrder NULLS LAST,
    ec.DisplayOrder,
    ec.CriterionID;


-- Evaluation cycle configuration
SELECT
    ec.CycleID,
    t.Semester,
    t.YearNum,
    ec.SignUpDeadLine,
    ec.ObservationDeadLine,
    ec.PostObservationFeedbackDeadLine,
    ec.AppFeedbackDeadLine,
    ot.TemplateID,
    ot.TemplateVersion,
    ot.IsLocked
FROM EvaluationCycle ec
JOIN AcademicTerm t
    ON t.TermID = ec.TermID
LEFT JOIN ObservationTemplate ot
    ON ot.TemplateID = ec.TemplateID
WHERE ec.CycleID = 1;



-- Teacher Dashboard: Professor Profile
SELECT
    p.ProfessorID,
    p.ProfessorName,
    d.DepartmentName,
    p.CurrentLevel,

    CASE
        WHEN p.CurrentLevel = 'Assistant'
            THEN 'Annual'
        WHEN p.CurrentLevel IN ('Associate', 'Full')
            THEN 'Every 2 years'
        ELSE 'Not specified'
    END AS EvaluationFrequency,

    (
        SELECT COUNT(*)
        FROM Observation o
        WHERE o.ObserverProfessorID = p.ProfessorID
          AND o.Status = 'Completed'
    ) AS EvaluationsGiven,

    (
        SELECT MAX(o.CompletedDate)
        FROM Observation o
        WHERE o.ObserveeID = p.ProfessorID
          AND o.Status = 'Completed'
          AND o.CompletedDate IS NOT NULL
    ) AS LastEvaluationDate

FROM Professors p
JOIN Department d
    ON d.DepartmentID = p.ProfessorDepartment
WHERE p.ProfessorID = 3;




-- Teacher Dashboard: Upcoming Observations
-- Includes both observer and observee roles
SELECT
    pod.ObservationID,
    pod.SignupID,
    pod.CycleID,

    CASE
        WHEN pod.ObserveeID = 3
            THEN 'Being observed'
        ELSE 'Observing'
    END AS EvaluationType,

    CASE
        WHEN pod.ObserveeID = 3
            THEN pod.ObserverName
        ELSE pod.ObserveeName
    END AS OtherProfessor,

    pod.CourseCode,
    pod.CourseName,
    pod.SectionName,
    pod.ScheduledDate,
    pod.ScheduledTime,
    pod.ObservationStatus,
    pod.ObservationDeadLine

FROM ProfessorObservationDashboard pod
WHERE (
    pod.ObserveeID = 3
    OR pod.ObserverProfessorID = 3
)
AND pod.ScheduledDate >= CURRENT_DATE
AND pod.ObservationStatus IS DISTINCT FROM 'Completed'

ORDER BY
    pod.ScheduledDate,
    pod.ScheduledTime;


-- Teacher Dashboard: Teaching schedule for current term
SELECT
    SectionID,
    SectionName,
    CourseCode,
    CourseName,
    MeetingDays,
    StartTime,
    EndTime
FROM ProfessorCourseSchedule
WHERE ProfessorID = 3
  AND TermID = 1
ORDER BY MeetingDays, StartTime;


-- Teacher Dashboard: Evaluations scheduled this month
-- Includes observing and being observed
SELECT
    COUNT(*) AS EvaluationsThisMonth
FROM Observation o
WHERE (
    o.ObserveeID = 3
    OR o.ObserverProfessorID = 3
)
AND o.ScheduledDate >= DATE_TRUNC('month', CURRENT_DATE)::DATE
AND o.ScheduledDate <
    (DATE_TRUNC('month', CURRENT_DATE)
        + INTERVAL '1 month')::DATE;


-- Teacher Evaluations: Evaluation requirement and progress
SELECT
    fed.ProfessorID,
    fed.ProfessorName,
    fed.CurrentLevel,
    fed.CycleID,
    fed.EvaluationYear,
    fed.RequiredIntervalYears,
    fed.LastEvaluationYear,
    fed.IsDue,

    COUNT(DISTINCT o.ObservationID)
        FILTER (
            WHERE o.Status = 'Completed'
        ) AS EvaluationsReceived,

    ec.ObservationDeadLine

FROM FacultyEvaluationDue fed
JOIN EvaluationCycle ec
    ON ec.CycleID = fed.CycleID

LEFT JOIN ObservationSignup os
    ON os.ObserveeProfessorID = fed.ProfessorID
   AND os.CycleID = fed.CycleID

LEFT JOIN Observation o
    ON o.SignupID = os.SignupID
   AND o.ObserveeID = fed.ProfessorID

WHERE fed.ProfessorID = 3
  AND fed.CycleID = 1

GROUP BY
    fed.ProfessorID,
    fed.ProfessorName,
    fed.CurrentLevel,
    fed.CycleID,
    fed.EvaluationYear,
    fed.RequiredIntervalYears,
    fed.LastEvaluationYear,
    fed.IsDue,
    ec.ObservationDeadLine;


-- Teacher Evaluations: Evaluation history
-- Includes evaluations given and received
SELECT
    o.ObservationID,
    o.CompletedDate AS EvaluationDate,

    CASE
        WHEN o.ObserveeID = 3
            THEN 'Observed'
        ELSE 'Observing'
    END AS EvaluationType,

    CASE
        WHEN o.ObserveeID = 3
            THEN observer.ProfessorName
        ELSE observee.ProfessorName
    END AS OtherProfessor,

    c.CourseCode,
    c.CourseName,
    o.Status,
    o.Notes

FROM Observation o
JOIN ObservationSignup os
    ON os.SignupID = o.SignupID

JOIN Professors observee
    ON observee.ProfessorID = o.ObserveeID

JOIN Professors observer
    ON observer.ProfessorID = o.ObserverProfessorID

JOIN Sections s
    ON s.SectionID = os.SectionID

JOIN Courses c
    ON c.CourseID = s.CourseID

WHERE (
    o.ObserveeID = 3
    OR o.ObserverProfessorID = 3
)
AND o.Status = 'Completed'

ORDER BY
    o.CompletedDate DESC,
    o.ObservationID DESC;


-- Teacher Evaluations: Eligible observers
-- Same department and same course level,
-- with existing eligibility and scheduling checks
SELECT
    e.ProfessorID,
    p.ProfessorName,
    p.CurrentLevel,
    d.DepartmentName
FROM get_eligible_observers(1) e
JOIN Professors p
    ON p.ProfessorID = e.ProfessorID
JOIN Department d
    ON d.DepartmentID = p.ProfessorDepartment
ORDER BY p.ProfessorName;


-- Teacher Evaluations: Incoming observation requests
SELECT
    RequestID,
    SignupID,
    ObserverProfessorID,
    ObserveeName,
    CourseCode,
    CourseName,
    SectionName,
    MeetingDays,
    StartTime,
    EndTime,
    RequestDate,
    ExpirationDate,
    ExpirationTime,
    RequestStatus
FROM ProfessorObserverInvitations
WHERE ObserverProfessorID = 3
ORDER BY
    CASE WHEN RequestStatus = 'Pending' THEN 0 ELSE 1 END,
    ExpirationDate,
    ExpirationTime;


-- Teacher Settings: Read-only professor profile
SELECT
    p.ProfessorID,
    p.ProfessorName,
    p.CurrentLevel,
    d.DepartmentName
FROM Professors p
JOIN Department d
    ON d.DepartmentID = p.ProfessorDepartment
WHERE p.ProfessorID = 3;
