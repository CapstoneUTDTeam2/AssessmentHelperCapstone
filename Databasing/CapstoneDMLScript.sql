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
(),
();

INSERT INTO AcademicTerm(TermID, Semester, YearNum)
Values
(),
();

INSERT INTO Courses(CourseID, CourseName, CourseCode, CourseDescription)
Values
(),
();

INSERT INTO Professors(ProfessorID, ProfessorName, ProfessorDepartment, CurrentLevel, StartTermID)
Values
(),
();

INSERT INTO Sections(SectionID, SectionName, CourseID, TermID, MeetingDays, StartTime, EndTime)
Values
(),
();

INSERT INTO EvaluationCycle(CycleID, TermID, SignUpDeadLine, ObservationDeadLine, FeedbackDeadLine)
Values
(),
();

INSERT INTO ObservationTemplate(TemplateID, TemplateVersion, TemplateContent, LastUpdateDate, LastUpdateTime, isActive)
Values
(),
();

INSERT INTO ObservationSignup(SignupID, CycleID, ObserveeProfessorID, SectionID, PreferredTimes, SignupDate, 
    SignupTime, Status)
Values
(),
();

INSERT INTO ObserverRequest(RequestID, SignupID, ObserverProfessorID, RequestDate, RequestTime, ExpirationDate, 
    ExpirationTime, Status)
Values
(),
();

INSERT INTO TeachingAssignment(SectionID, ProfessorID)
Values
(),
();

INSERT INTO Observation(ObservationID, SignupID, ObservationDate, ObserverProfessorID, TemplateID, ScheduledDate,
    ScheduledTime, CompletedDate, CompletedTime, Status, Signee, Observer, Notes, ObserveeID, ObservationTime)
Values
(),
();

INSERT INTO SurveyResponse(SurveyResponseID, CycleID, ProfessorID, SignupID, Role, SubmissionDate, SubmissionTime,
    ProcessStatus, Difficulties, ImprovementConditions)
Values
(),
();