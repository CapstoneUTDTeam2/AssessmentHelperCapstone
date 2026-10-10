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
FROM SurveyResponse sr
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