--Department(DepartmentID INT, DepartmentName VarChar(50))
--AcademicTerm(TermID INT, Semester VARCHAR(10), YearNum int)
--Courses(CourseID INT, CourseName VARCHAR(50), CourseCode VARCHAR(20), CourseDescription VARCHAR(255))
--Professors(ProfessorID INT ,ProfessorName VARCHAR(50), ProfessorDepartment INT, CurrentLevel VARCHAR(30), StartTermID INT)
--Sections(SectionID INT, SectionName VARCHAR(5), CourseID INT, TermID INT, MeetingDays VARCHAR(20),StartTime TIME, 
  --EndTime TIME)
--EvaluationCycle(CycleID INT, TermID INT, SignUpDeadLine DATE, ObservationDeadLine DATE, FeedbackDeadLine DATE)
--ObservationTemplate(TemplateID INT, TemplateVersion VARCHAR(100), TemplateContent TEXT, LastUpdateDate DATE, 
  --LastUpdateTime TIME, isActive BOOLEAN)
--ObservationSignup(SignupID INT, CycleID INT, ObserveeProfessorID INT, SectionID INT, PreferredTimes TEXT, 
  --SignupDate DATE, SignupTime TIME, Status VARCHAR(20))
--ObserverRequest(RequestID INT, SignupID INT, ObserverProfessorID INT, RequestDate DATE, RequestTime TIME, 
  --ExpirationDate DATE, ExpirationTime TIME, Status VARCHAR(20))
--TeachingAssignment(SectionID INT, ProfessorID INT)
--Observation(ObservationID INT, SignupID INT, ObservationDate DATE, ObserverProfessorID INT, TemplateID INT, 
 --ScheduledDate DATE, ScheduledTime TIME, CompletedDate DATE, CompletedTime TIME, Status VARCHAR(20), Signee VARCHAR(255),
 --Observer VARCHAR(255), Notes Text, ObserveeID INT NOT NULL, ObservationTime TIME)
--SurveyResponse(SurveyResponseID INT, CycleID INT, ProfessorID INT, SignupID INT, Role VARCHAR(20), SubmissionDate DATE,
  --SubmissionTime TIME, ProcessStatus VARCHAR(50), Difficulties TEXT, ImprovementConditions TEXT)

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
(6, 'Frank Wilson', 2, 'Full Professor', 1);

INSERT INTO Sections(SectionID, SectionName, CourseID, TermID, MeetingDays, StartTime, EndTime)
Values
(1, '001', 1, 5, 'MW', '09:00:00', '10:15:00'),
(2, '002', 2, 5, 'TR', '10:00:00', '11:15:00'),
(3, '001', 3, 5, 'MW', '13:00:00', '14:15:00'),
(4, '001', 4, 5, 'TR', '15:00:00', '16:15:00'),
(5, '001', 5, 5, 'MW', '11:00:00', '12:15:00'),
(6, '001', 6, 5, 'TR', '13:00:00', '14:15:00');

INSERT INTO EvaluationCycle(CycleID, TermID, SignUpDeadLine, ObservationDeadLine, FeedbackDeadLine)
Values
(1, 4, '2026-01-30', '2026-04-15', '2026-05-01'),
(2, 5, '2026-09-15', '2026-11-15', '2026-12-01');

INSERT INTO ObservationTemplate(TemplateID, TemplateVersion, TemplateContent, LastUpdateDate, LastUpdateTime, isActive)
Values
(1, '1.0', 'Standard classroom observation template.', '2026-01-10', '09:00:00', FALSE),
(2, '2.0', 'Updated classroom observation template with revised teaching criteria.', '2026-08-15', '10:30:00', TRUE);

INSERT INTO ObservationSignup(SignupID, CycleID, ObserveeProfessorID, SectionID, PreferredTimes, SignupDate, 
    SignupTime, Status)
Values
(1, 2, 1, 1, 'Monday or Wednesday morning', '2026-09-05', '09:30:00', 'Accepted'),
(2, 2, 2, 2, 'Tuesday morning', '2026-09-06', '10:15:00', 'Accepted'),
(3, 2, 3, 3, 'Monday afternoon', '2026-09-07', '11:00:00', 'Pending'),
(4, 2, 4, 4, 'Tuesday afternoon', '2026-09-08', '14:30:00', 'Pending');

INSERT INTO ObserverRequest(RequestID, SignupID, ObserverProfessorID, RequestDate, RequestTime, ExpirationDate, 
    ExpirationTime, Status)
Values
(1, 1, 2, '2026-09-06', '14:00:00', '2026-09-10', '23:59:00', 'Accepted'),
(2, 2, 3, '2026-09-07', '15:00:00', '2026-09-11', '23:59:00', 'Accepted'),
(3, 3, 1, '2026-09-08', '09:00:00', '2026-09-12', '23:59:00', 'Pending'),
(4, 4, 2, '2026-09-09', '13:00:00', '2026-09-13', '23:59:00', 'Pending');

INSERT INTO TeachingAssignment(SectionID, ProfessorID)
Values
(1, 1),
(2, 2),
(3, 3),
(4, 1),
(5, 4),
(6, 5);

INSERT INTO Observation(ObservationID, SignupID, ObservationDate, ObserverProfessorID, TemplateID, ScheduledDate,
    ScheduledTime, CompletedDate, CompletedTime, Status, Signee, Observer, Notes, ObserveeID, ObservationTime)
Values
(1, 1, '2026-10-15', 2, 2, '2026-10-15', '09:00:00', '2026-10-15', '10:15:00', 'Completed', 'Alice Johnson', 'Robert Smith', 'Strong classroom organization and clear explanations.', 1, '09:00:00'),
(2, 2, '2026-10-20', 3, 2, '2026-10-20', '10:00:00', '2026-10-20', '11:15:00', 'Completed', 'Robert Smith', 'Carol Williams', 'Effective use of examples and student interaction.', 2, '10:00:00'),
(3, 3, '2026-10-26', 1, 2, '2026-10-26', '13:00:00', NULL, NULL, 'Scheduled', 'Carol Williams', 'Alice Johnson', 'Observation scheduled for the fall evaluation cycle.', 3, '13:00:00'),
(4, 4, '2026-11-03', 2, 2, '2026-11-03', '15:00:00', NULL, NULL, 'Scheduled', 'David Brown', 'Robert Smith', 'Observation scheduled for the fall evaluation cycle.', 4, '15:00:00');

INSERT INTO SurveyResponse(SurveyResponseID, CycleID, ProfessorID, SignupID, Role, SubmissionDate, SubmissionTime,
    ProcessStatus, Difficulties, ImprovementConditions)
Values
(1, 2, 1, 1, 'Observee', '2026-10-16', '12:00:00', 'Processed', 'No major difficulties.', 'Additional classroom technology support would be helpful.'),
(2, 2, 2, 2, 'Observee', '2026-10-21', '13:30:00', 'Processed', 'Projector connection was unreliable.', 'Improved classroom technology would be beneficial.'),
(3, 2, 3, 3, 'Observer', '2026-10-27', '14:00:00', 'Pending', 'No difficulties reported.', 'Additional time for observation feedback would be useful.'),
(4, 2, 4, 4, 'Observer', '2026-11-04', '16:00:00', 'Pending', 'No difficulties reported.', 'None reported.');