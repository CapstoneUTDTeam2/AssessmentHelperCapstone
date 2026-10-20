DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'TRUNCATE TABLE public.'
            || quote_ident(t.tablename)
            || ' RESTART IDENTITY CASCADE';
    END LOOP;
END $$;

INSERT INTO Department(DepartmentID, DepartmentName)
Values
(1, 'Computer Science'),
(2, 'Agriculture'),
(3, 'Mathematics'),
(4, 'Biology'),
(5, 'History');

INSERT INTO AcademicTerm(TermID, Semester, YearNum)
Values
(1, 'Fall', 2024),
(2, 'Spring', 2025),
(3, 'Fall', 2025),
(4, 'Spring', 2026),
(5, 'Fall', 2026);

INSERT INTO Courses(CourseID, CourseName, CourseCode, CourseDescription)
Values
(1, 'Introduction to Programming', 'CS 1337', 'Introduction to programming and problem solving'),
(2, 'Data Structures', 'CS 2336', 'Fundamental data structures and algorithms'),
(3, 'Database Systems', 'CS 4347', 'Database design, implementation, and management'),
(4, 'Software Engineering', 'CS 3354', 'Principles and practices of software engineering'),
(5, 'Calculus I', 'MATH 2413', 'Differential calculus and applications'),
(6, 'General Biology', 'BIOL 1301', 'Introduction to biological sciences');

INSERT INTO Professors(ProfessorID, ProfessorName, ProfessorDepartment, CurrentLevel, StartTermID)
Values
(1, 'Alice Johnson', 1, 'Assistant Professor', 1),
(2, 'Robert Smith', 1, 'Associate Professor', 1),
(3, 'Carol Williams', 1, 'Full Professor', 2),
(4, 'David Brown', 3, 'Assistant Professor', 3),
(5, 'Emily Davis', 4, 'Associate Professor', 2),
(6, 'Frank Wilson', 2, 'Full Professor', 1),
(7, 'Grace Lee', 3, 'Associate Professor', 1);

INSERT INTO Sections(SectionID, SectionName, CourseID, TermID, MeetingDays, StartTime, EndTime)
Values
(1, '001', 1, 5, 'MW', '09:00:00', '10:15:00'),
(2, '002', 2, 5, 'TR', '10:00:00', '11:15:00'),
(3, '001', 3, 5, 'MW', '13:00:00', '14:15:00'),
(4, '001', 4, 5, 'TR', '15:00:00', '16:15:00'),
(5, '001', 5, 5, 'MW', '11:00:00', '12:15:00'),
(6, '001', 6, 5, 'TR', '13:00:00', '14:15:00'),
-- Past sections: give observers the course-level history the eligibility rules require
(7, '001', 1, 3, 'MW', '09:00:00', '10:15:00'),  -- CS 1337, Fall 2025
(8, '001', 2, 4, 'TR', '10:00:00', '11:15:00'),  -- CS 2336, Spring 2026
(9, '001', 3, 3, 'MW', '13:00:00', '14:15:00'),  -- CS 4347, Fall 2025
(10, '001', 5, 4, 'MW', '11:00:00', '12:15:00'); -- MATH 2413, Spring 2026

INSERT INTO TeachingAssignment(SectionID, ProfessorID)
Values
(1, 1),
(2, 2),
(3, 3),
(4, 1),
(5, 4),
(6, 5),
(7, 2),
(8, 3),
(9, 1),
(10, 7);

INSERT INTO ObservationTemplate(TemplateID, TemplateVersion, TemplateContent, LastUpdateDate, LastUpdateTime, isActive)
Values
(1, '1.0', 'Standard classroom observation template.', '2026-01-10', '09:00:00', FALSE),
(2, '2.0', 'Updated classroom observation template with revised teaching criteria.', '2026-08-15', '10:30:00', TRUE);

INSERT INTO EvaluationCycle(CycleID, TermID, SignUpDeadLine, ObservationDeadLine, PostObservationFeedbackDeadLine, AppFeedbackDeadLine, TemplateID)
Values
(1, 4, '2026-01-30', '2026-04-15', '2026-05-01', '2026-05-15', 1),
(2, 5, '2026-09-15', '2026-11-15', '2026-12-15', '2026-12-15', 2);

INSERT INTO ObservationSignup(SignupID, CycleID, ObserveeProfessorID, SectionID, SignupDate, 
    SignupTime, Status)
Values
(1, 2, 1, 1, '2026-09-05', '09:30:00', 'Accepted'),
(2, 2, 2, 2, '2026-09-06', '10:15:00', 'Accepted'),
(3, 2, 3, 3, '2026-09-07', '11:00:00', 'Pending'),
(4, 2, 4, 5, '2026-09-08', '14:30:00', 'Pending');

INSERT INTO SignupPreferredDate(SignupID, PreferredDate)
VALUES
(1, '2026-10-12'), (1, '2026-10-14'),   -- Mon / Wed (CS 1337 meets MW)
(2, '2026-10-20'), (2, '2026-10-22'),   -- Tue / Thu (CS 2336 meets TR)
(3, '2026-10-26'), (3, '2026-10-28'),   -- Mon / Wed (CS 4347 meets MW)
(4, '2026-11-02'), (4, '2026-11-04');   -- Mon / Wed (MATH 2413 meets MW)

INSERT INTO ObserverEnrollment(ProfessorID, CycleID)
VALUES (1, 2), (2, 2), (3, 2), (7, 2);

INSERT INTO ObserverAvailability(ProfessorID, CycleID, Weekday, StartTime, EndTime)
VALUES
(2, 2, 'M', '08:00', '17:00'), (2, 2, 'W', '08:00', '17:00'),
(3, 2, 'T', '08:00', '17:00'), (3, 2, 'R', '08:00', '17:00'),
(1, 2, 'M', '12:00', '17:00'), (1, 2, 'W', '12:00', '17:00'),
(7, 2, 'M', '08:00', '17:00'), (7, 2, 'W', '08:00', '17:00');

-- Carol cannot do Oct 22, but Oct 20 still works for signup 2
INSERT INTO ObserverUnavailableDate(ProfessorID, CycleID, UnavailableDate)
VALUES (3, 2, '2026-10-22');

INSERT INTO ObserverRequest(RequestID, SignupID, ObserverProfessorID, RequestDate, RequestTime, ExpirationDate, 
    ExpirationTime, Status)
Values
(1, 1, 2, '2026-09-06', '14:00:00', '2026-09-10', '23:59:00', 'Accepted'),
(2, 2, 3, '2026-09-07', '15:00:00', '2026-09-11', '23:59:00', 'Accepted'),
(3, 3, 1, '2026-09-08', '09:00:00', '2026-09-12', '23:59:00', 'Accepted'),
(4, 4, 7, '2026-09-09', '13:00:00', '2026-09-13', '23:59:00', 'Accepted');

INSERT INTO PostObservationSurveyResponse(SurveyResponseID, CycleID, ProfessorID, SignupID, Role, SubmissionDate, SubmissionTime,
    ProcessStatus, Difficulties, ImprovementConditions)
Values
(1, 2, 1, 1, 'Observee', '2026-10-16', '12:00:00', 'Processed', 'No major difficulties.', 'Additional classroom technology support would be helpful.'),
(2, 2, 2, 2, 'Observee', '2026-10-21', '13:30:00', 'Processed', 'Projector connection was unreliable.', 'Improved classroom technology would be beneficial.'),
(3, 2, 3, 3, 'Observer', '2026-10-27', '14:00:00', 'Pending', 'No difficulties reported.', 'Additional time for observation feedback would be useful.'),
(4, 2, 4, 4, 'Observer', '2026-11-04', '16:00:00', 'Pending', 'No difficulties reported.', 'None reported.');

INSERT INTO EvaluationCriterion (CriterionID, TemplateID, CriterionName, Description)
VALUES
(1, 1, 'Organization',        'Class is structured and follows a clear plan.'),
(2, 1, 'Clarity',             'Concepts are explained clearly.'),
(3, 1, 'Engagement',          'Students are actively involved.'),
(4, 2, 'Organization',        'Class is structured and follows a clear plan.'),
(5, 2, 'Clarity',             'Concepts are explained clearly.'),
(6, 2, 'Student Interaction', 'Instructor interacts effectively with students.');

INSERT INTO Observation(ObservationID, SignupID, ObservationDate, ObserverProfessorID, TemplateID, ScheduledDate,
    ScheduledTime, CompletedDate, CompletedTime, Status, Signee, Observer, Notes, ObserveeID, ObservationTime)
Values
(1, 1, '2026-10-14', 2, 2, '2026-10-14', '09:00:00', NULL, NULL, 'Scheduled', 'Alice Johnson', 'Robert Smith', 'Strong classroom organization and clear explanations.', 1, '09:00:00'),
(2, 2, '2026-10-20', 3, 2, '2026-10-20', '10:00:00', NULL, NULL, 'Scheduled', 'Robert Smith', 'Carol Williams', 'Effective use of examples and student interaction.', 2, '10:00:00'),
(3, 3, '2026-10-26', 1, 2, '2026-10-26', '13:00:00', NULL, NULL, 'Scheduled', 'Carol Williams', 'Alice Johnson', 'Observation scheduled for the fall evaluation cycle.', 3, '13:00:00'),
(4, 4, '2026-11-04', 7, 2, '2026-11-04', '15:00:00', NULL, NULL, 'Scheduled', 'David Brown', 'Grace Lee', 'Observation scheduled for the fall evaluation cycle.', 4, '15:00:00');

INSERT INTO ObservationCriterionRating (ObservationID, CriterionID, TemplateID, Rating, Comments)
VALUES
(1, 4, 2, 5, 'Well organized lecture.'),
(1, 5, 2, 4, 'Clear explanations.'),
(1, 6, 2, 6, 'Not applicable this session.'),
(2, 4, 2, 4, 'Good pacing.'),
(2, 5, 2, 5, 'Strong examples.'),
(2, 6, 2, 5, 'Good student participation.');

-- Completing an observation locks its template and freezes its ratings, so do it last.
UPDATE Observation SET Status = 'Completed', CompletedDate = '2026-10-14', CompletedTime = '10:15:00' WHERE ObservationID = 1;
UPDATE Observation SET Status = 'Completed', CompletedDate = '2026-10-20', CompletedTime = '11:15:00' WHERE ObservationID = 2;