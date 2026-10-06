DO $$
DECLARE
    tabname RECORD;
BEGIN
    FOR tabname IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.'
            || quote_ident(tabname.tablename)
            || ' CASCADE';
    END LOOP;
END $$;



CREATE TABLE Department (
    DepartmentID INT PRIMARY KEY,
    DepartmentName VARCHAR(50) NOT NULL
);

CREATE TABLE AcademicTerm (
    TermID INT PRIMARY KEY,
    Semester VARCHAR(10),
    YearNum int
);

CREATE TABLE Professors (
    ProfessorID INT PRIMARY KEY,
    ProfessorName VARCHAR(50) NOT NULL ,
    ProfessorDepartment INT NOT NULL ,
    CurrentLevel VARCHAR(30),
    StartTermID INT,
    foreign key (ProfessorDepartment) references Department(DepartmentID),
    foreign key (StartTermID) references AcademicTerm(TermID)
);

CREATE TABLE Courses (
    CourseID INT PRIMARY KEY,
    CourseName VARCHAR(50) NOT NULL,
    CourseCode VARCHAR(20) NOT NULL,
    CourseDescription VARCHAR(255) NOT NULL
);

CREATE TABLE Sections (
    SectionID INT PRIMARY KEY NOT NULL,
    SectionName VARCHAR(5) NOT NULL,
    CourseID INT NOT NULL,
    TermID  INT NOT NULL,
    MeetingDays VARCHAR(20),
    StartTime TIME,
    EndTime TIME,
    foreign key (TermID) references AcademicTerm(TermID),
    foreign key (CourseID) references Courses(CourseID)
);

CREATE TABLE EvaluationCycle (
    CycleID INT PRIMARY KEY,
    TermID INT NOT NULL,
    SignUpDeadLine DATE,
    ObservationDeadLine DATE,
    FeedbackDeadLine DATE,
    foreign key (TermID) references AcademicTerm(TermID)
);
--Empty current report/archieved report SHE WANTS IT LETS GOOO (5 versions max)
CREATE TABLE ObservationTemplate(
    TemplateID INT PRIMARY KEY,
    TemplateVersion VARCHAR(100),
    TemplateContent TEXT,
    LastUpdateDate DATE,
    LastUpdateTime TIME,
    isActive BOOLEAN
);

CREATE TABLE ObservationSignup (
    SignupID INT PRIMARY KEY,
    CycleID INT,
    ObserveeProfessorID INT,
    SectionID INT,
    PreferredTimes TEXT,
    SignupDate DATE,
    SignupTime TIME,
    Status VARCHAR(20),
    foreign key (CycleID) references  EvaluationCycle(CycleID),
    foreign key (ObserveeProfessorID) references Professors(ProfessorID),
    foreign key (SectionID) references Sections(SectionID)
);

CREATE TABLE ObserverRequest(
    RequestID INT PRIMARY KEY,
    SignupID INT,
    ObserverProfessorID INT,
    RequestDate DATE,
    RequestTime TIME,
    ExpirationDate DATE,
    ExpirationTime TIME,
    Status VARCHAR(20),
    foreign key (SignupID) references ObserverRequest(SignupID),
    foreign key (ObserverProfessorID) references Professors(ProfessorID)
);

CREATE TABLE TeachingAssignment (
    SectionID INT,
    ProfessorID INT,
    PRIMARY KEY (SectionID, ProfessorID),
    foreign key (SectionID) references Sections(SectionID),
    foreign key (ProfessorID) references Professors(ProfessorID)
);
--Filled out in accordance to the frontend
CREATE TABLE Observation (
    ObservationID INT PRIMARY KEY,
    SignupID INT,
    ObservationDate DATE,
    ObserverProfessorID INT NOT NULL,
    TemplateID INT,
    ScheduledDate DATE,
    ScheduledTime TIME,
    CompletedDate DATE,
    CompletedTime TIME,
    Status VARCHAR(20),
    Signee VARCHAR(255),
    Observer VARCHAR(255),
    Notes Text,
    ObserveeID INT NOT NULL,
    ObservationTime TIME,
    foreign key (ObserverProfessorID) references Professors(ProfessorID),
    foreign key (SignupID) references ObservationSignup(SignupID),
    foreign key (ObserveeID) references Professors(ProfessorID),
    foreign key (TemplateID) references ObservationTemplate(TemplateID)
);

--Post observation survey for database/technology
CREATE TABLE SurveyResponse (
    SurveyResponseID INT PRIMARY KEY,
    CycleID INT,
    ProfessorID INT,
    SignupID INT,
    Role VARCHAR(20),
    SubmissionDate DATE,
    SubmissionTime TIME,
    ProcessStatus VARCHAR(50),
    Difficulties TEXT,
    ImprovementConditions TEXT,
    foreign key (CycleID) references EvaluationCycle(CycleID),
    foreign key (ProfessorID) references Professors(ProfessorID),
    foreign key (SignupID) references ObserverRequest(SignupID)
);

--Specifically for observee explaining their case
--Observations last forever