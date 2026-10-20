-- This is mainly a place for Frontend to look for anything they might need to populate tables with;

-- Professor's course schedule and all the information about the professor
CREATE OR REPLACE VIEW ProfessorCourseSchedule AS
SELECT
    p.ProfessorID,
    p.ProfessorName,
    p.ProfessorDepartment,
    s.SectionID,
    s.SectionName,
    c.CourseID,
    c.CourseCode,
    c.CourseName,
    t.TermID,
    t.Semester,
    t.YearNum,
    s.MeetingDays,
    s.StartTime,
    s.EndTime
FROM TeachingAssignment ta
JOIN Professors p ON p.ProfessorID = ta.ProfessorID
JOIN Sections s ON s.SectionID = ta.SectionID
JOIN Courses c ON c.CourseID = s.CourseID
JOIN AcademicTerm t ON t.TermID = s.TermID;

-- Professor Observation Dashboard
CREATE OR REPLACE VIEW ProfessorObservationDashboard AS
SELECT
    o.ObservationID,
    os.SignupID,
    os.CycleID,
    o.ObserveeID,
    o.ObserverProfessorID,
    observee.ProfessorName AS ObserveeName,
    observer.ProfessorName AS ObserverName,
    c.CourseCode,
    c.CourseName,
    s.SectionName,
    o.ScheduledDate,
    o.ScheduledTime,
    o.CompletedDate,
    o.Status AS ObservationStatus,
    ec.ObservationDeadLine
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
JOIN EvaluationCycle ec
    ON ec.CycleID = os.CycleID;


-- Currently Pending Observations

CREATE OR REPLACE VIEW ProfessorObserverInvitations AS
SELECT
    orq.RequestID,
    orq.SignupID,
    orq.ObserverProfessorID,
    observer.ProfessorName AS ObserverName,
    observee.ProfessorName AS ObserveeName,
    c.CourseCode,
    c.CourseName,
    s.SectionName,
    s.MeetingDays,
    s.StartTime,
    s.EndTime,
    orq.RequestDate,
    orq.ExpirationDate,
    orq.ExpirationTime,
    orq.Status AS RequestStatus
FROM ObserverRequest orq
JOIN ObservationSignup os
    ON os.SignupID = orq.SignupID
JOIN Professors observer
    ON observer.ProfessorID = orq.ObserverProfessorID
JOIN Professors observee
    ON observee.ProfessorID = os.ObserveeProfessorID
JOIN Sections s
    ON s.SectionID = os.SectionID
JOIN Courses c
    ON c.CourseID = s.CourseID;



--Full signup page for AC
CREATE OR REPLACE VIEW SignupObserverCoverage AS
SELECT
    os.SignupID,
    os.CycleID,
    os.ObserveeProfessorID,
    p.ProfessorName AS ObserveeName,
    c.CourseCode,
    os.Status AS SignupStatus,

    (
        SELECT COUNT(*)
        FROM get_eligible_observers(os.SignupID)
    ) AS EligibleCount,

    COUNT(DISTINCT orq.ObserverProfessorID)
        FILTER (
            WHERE orq.Status = 'Pending'
        ) AS PendingRequests,

    COUNT(DISTINCT orq.ObserverProfessorID)
        FILTER (
            WHERE orq.Status = 'Accepted'
        ) AS AcceptedRequests

FROM ObservationSignup os
JOIN Professors p
    ON p.ProfessorID = os.ObserveeProfessorID
JOIN Sections s
    ON s.SectionID = os.SectionID
JOIN Courses c
    ON c.CourseID = s.CourseID
LEFT JOIN ObserverRequest orq
    ON orq.SignupID = os.SignupID

GROUP BY
    os.SignupID,
    os.CycleID,
    os.ObserveeProfessorID,
    p.ProfessorName,
    c.CourseCode,
    os.Status;


-- Course Overview
CREATE OR REPLACE VIEW CourseOverview AS
SELECT
    c.CourseID,
    c.CourseCode,
    c.CourseName,
    t.TermID,
    t.Semester,
    t.YearNum,

    COUNT(DISTINCT s.SectionID) AS SectionCount,
    COUNT(DISTINCT ta.ProfessorID) AS InstructorCount

FROM Courses c
JOIN Sections s
    ON s.CourseID = c.CourseID
JOIN AcademicTerm t
    ON t.TermID = s.TermID
LEFT JOIN TeachingAssignment ta
    ON ta.SectionID = s.SectionID

GROUP BY
    c.CourseID,
    c.CourseCode,
    c.CourseName,
    t.TermID,
    t.Semester,
    t.YearNum;

-- Course Section Detailing
CREATE OR REPLACE VIEW CourseSectionDetails AS
SELECT
    c.CourseID,
    c.CourseCode,
    c.CourseName,
    s.SectionID,
    s.SectionName,
    s.TermID,
    s.MeetingDays,
    s.StartTime,
    s.EndTime,
    p.ProfessorID,
    p.ProfessorName,
    p.CurrentLevel

FROM Sections s
JOIN Courses c
    ON c.CourseID = s.CourseID
LEFT JOIN TeachingAssignment ta
    ON ta.SectionID = s.SectionID
LEFT JOIN Professors p
    ON p.ProfessorID = ta.ProfessorID;

-- Course Instructor History
CREATE OR REPLACE VIEW CourseInstructorHistory AS
SELECT
    c.CourseID,
    c.CourseCode,
    t.TermID,
    t.Semester,
    t.YearNum,
    p.ProfessorID,
    p.ProfessorName,
    COUNT(DISTINCT s.SectionID) AS SectionsTaught

FROM TeachingAssignment ta
JOIN Professors p
    ON p.ProfessorID = ta.ProfessorID
JOIN Sections s
    ON s.SectionID = ta.SectionID
JOIN Courses c
    ON c.CourseID = s.CourseID
JOIN AcademicTerm t
    ON t.TermID = s.TermID

GROUP BY
    c.CourseID,
    c.CourseCode,
    t.TermID,
    t.Semester,
    t.YearNum,
    p.ProfessorID,
    p.ProfessorName;


CREATE OR REPLACE VIEW ObserverWorkload AS
SELECT
    p.ProfessorID,
    p.ProfessorName,
    ec.CycleID,

    COUNT(DISTINCT o.ObservationID)
        AS AssignedObservations

FROM Professors p
CROSS JOIN EvaluationCycle ec

LEFT JOIN (
    Observation o
    JOIN ObservationSignup os
        ON os.SignupID = o.SignupID
)
    ON o.ObserverProfessorID = p.ProfessorID
   AND os.CycleID = ec.CycleID

GROUP BY
    p.ProfessorID,
    p.ProfessorName,
    ec.CycleID;

-- Evaluation Dueness
CREATE OR REPLACE VIEW FacultyEvaluationDue AS
WITH CompletedEvaluations AS (
    SELECT
        o.ObserveeID AS ProfessorID,
        MAX(t.YearNum) AS LastEvaluationYear
    FROM Observation o
    JOIN ObservationSignup os
        ON os.SignupID = o.SignupID
    JOIN EvaluationCycle ec
        ON ec.CycleID = os.CycleID
    JOIN AcademicTerm t
        ON t.TermID = ec.TermID
    WHERE o.Status = 'Completed'
      AND o.CompletedDate IS NOT NULL
    GROUP BY o.ObserveeID
)
SELECT
    ec.CycleID,
    term.Semester,
    term.YearNum AS EvaluationYear,

    p.ProfessorID,
    p.ProfessorName,
    p.CurrentLevel,

    ce.LastEvaluationYear,

    CASE
        WHEN p.CurrentLevel = 'Assistant'
            THEN 1
        WHEN p.CurrentLevel IN ('Associate', 'Full')
            THEN 2
        ELSE NULL
    END AS RequiredIntervalYears,

    CASE
        WHEN p.CurrentLevel NOT IN
            ('Assistant', 'Associate', 'Full')
            OR p.CurrentLevel IS NULL
            THEN NULL

        WHEN ce.LastEvaluationYear IS NULL
            THEN TRUE

        WHEN term.YearNum - ce.LastEvaluationYear >=
            CASE
                WHEN p.CurrentLevel = 'Assistant'
                    THEN 1
                ELSE 2
            END
            THEN TRUE

        ELSE FALSE
    END AS IsDue

FROM Professors p
CROSS JOIN EvaluationCycle ec
JOIN AcademicTerm term
    ON term.TermID = ec.TermID

LEFT JOIN CompletedEvaluations ce
    ON ce.ProfessorID = p.ProfessorID;
