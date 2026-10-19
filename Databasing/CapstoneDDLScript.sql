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

--CREATE EXTENSION IF NOT EXISTS citext;

--CREATE TABLE Users(
    --for the time being im going to comment this UTD email bit
    --UTDallasEmail CITEXT UNIQUE NOT NULL,
    --UTDallasID VARCHAR(9) UNIQUE NOT NULL, if we can't get the email
    --password_hash TEXT NOT NULL
--);

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
    SignUpDeadLine DATE NOT NULL,
    ObservationDeadLine DATE NOT NULL,
    PostObservationFeedbackDeadLine DATE NOT NULL,
    AppFeedbackDeadLine DATE NOT NULL,
    foreign key (TermID) references AcademicTerm(TermID)
);
-- Check constraint that observation deadlines are not before signupdeadlines and feedback happens after observation
ALTER TABLE EvaluationCycle
    ADD CONSTRAINT valid_evaluation_deadline_order
    CHECK (
        SignUpDeadLine <= ObservationDeadLine
        AND ObservationDeadLine <= EvaluationCycle.PostObservationFeedbackDeadLine
    ),
    ADD CONSTRAINT valid_app_feedback_deadline
    CHECK (AppFeedbackDeadLine >= ObservationDeadLine);


--Empty current report/archieved report (5 versions max)
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
    foreign key (CycleID) references EvaluationCycle(CycleID),
    foreign key (ObserveeProfessorID) references Professors(ProfessorID),
    foreign key (SectionID) references Sections(SectionID)
);
-- Signup must be on or before the signup deadline, and it must be in the same term as current eval cycle
CREATE OR REPLACE FUNCTION check_signup_rules()
RETURNS TRIGGER AS $$
DECLARE
    cycle_term   INT;
    cycle_signup DATE;
    section_term INT;
BEGIN
    SELECT TermID, SignUpDeadLine
    INTO cycle_term, cycle_signup
    FROM EvaluationCycle
    WHERE CycleID = NEW.CycleID;
 
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Evaluation cycle does not exist';
    END IF;
 
    SELECT TermID
    INTO section_term
    FROM Sections
    WHERE SectionID = NEW.SectionID;
 
    IF section_term IS DISTINCT FROM cycle_term THEN
        RAISE EXCEPTION
            'Section term must match the evaluation cycle term';
    END IF;
 
    IF NEW.SignupDate IS NOT NULL AND NEW.SignupDate > cycle_signup THEN
        RAISE EXCEPTION
            'Signup date % is after the signup deadline %',
            NEW.SignupDate, cycle_signup;
    END IF;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER validate_signup_rules
BEFORE INSERT OR UPDATE ON ObservationSignup
FOR EACH ROW
EXECUTE FUNCTION check_signup_rules();

CREATE TABLE ObserverRequest(
    RequestID INT PRIMARY KEY,
    SignupID INT,
    ObserverProfessorID INT,
    RequestDate DATE,
    RequestTime TIME,
    ExpirationDate DATE,
    ExpirationTime TIME,
    Status VARCHAR(20), -- Pending/Accepted/Declined
    foreign key (SignupID) references ObservationSignup(SignupID),
    foreign key (ObserverProfessorID) references Professors(ProfessorID)
);

ALTER TABLE ObserverRequest
ADD CONSTRAINT unique_observer_per_signup
UNIQUE (SignupID, ObserverProfessorID);

CREATE OR REPLACE FUNCTION check_observer_eligibility()
RETURNS TRIGGER AS $$
DECLARE
    observee_id INT;
    observee_dept INT;
    observer_dept INT;
BEGIN
    SELECT os.ObserveeProfessorID, p.ProfessorDepartment
    INTO observee_id, observee_dept
    FROM ObservationSignup os
    JOIN Professors p
      ON p.ProfessorID = os.ObserveeProfessorID
    WHERE os.SignupID = NEW.SignupID;

    SELECT ProfessorDepartment
    INTO observer_dept
    FROM Professors
    WHERE ProfessorID = NEW.ObserverProfessorID;

    IF NEW.ObserverProfessorID = observee_id THEN
        RAISE EXCEPTION
            'A professor cannot observe themselves';
    END IF;

    IF observer_dept IS DISTINCT FROM observee_dept THEN
        RAISE EXCEPTION
            'Observer and observee must belong to the same department';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_observer_eligibility
BEFORE INSERT OR UPDATE ON ObserverRequest
FOR EACH ROW
EXECUTE FUNCTION check_observer_eligibility();


CREATE OR REPLACE FUNCTION check_observer_qualification()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM get_eligible_observers(NEW.SignupID) e
        WHERE e.ProfessorID = NEW.ObserverProfessorID
    ) THEN
        RAISE EXCEPTION
            'Professor % is not eligible for signup %',
            NEW.ObserverProfessorID,
            NEW.SignupID;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_observer_qualification
BEFORE INSERT OR UPDATE
ON ObserverRequest
FOR EACH ROW
EXECUTE FUNCTION check_observer_qualification();


CREATE TABLE TeachingAssignment (
    SectionID INT,
    ProfessorID INT,
    PRIMARY KEY (SectionID, ProfessorID),
    foreign key (SectionID) references Sections(SectionID),
    foreign key (ProfessorID) references Professors(ProfessorID)
);


-- Return every professor eligible to observe a signup.
CREATE OR REPLACE FUNCTION get_eligible_observers(
    p_signup_id INT
)
RETURNS TABLE (
    ProfessorID INT,
    ProfessorName VARCHAR(50)
)
LANGUAGE sql
AS $$
    WITH ranked_terms AS (
    SELECT
        t.TermID,
        ROW_NUMBER() OVER (
            ORDER BY
                t.YearNum DESC,
                CASE t.Semester
                    WHEN 'Fall' THEN 2
                    WHEN 'Spring' THEN 1
                END DESC
        ) AS term_rank
    FROM AcademicTerm t
    WHERE t.Semester IN ('Fall', 'Spring')
),

    target AS (
        SELECT
            os.ObserveeProfessorID,
            p.ProfessorDepartment,
            s.TermID,
            s.MeetingDays,
            s.StartTime,
            s.EndTime,

            -- CS 4485 -> '4'
            LEFT(
                SPLIT_PART(c.CourseCode, ' ', 2),
                1
            ) AS CourseLevel

        FROM ObservationSignup os
        JOIN Professors p
            ON p.ProfessorID = os.ObserveeProfessorID
        JOIN Sections s
            ON s.SectionID = os.SectionID
        JOIN Courses c
            ON c.CourseID = s.CourseID

        WHERE os.SignupID = p_signup_id
    )

    SELECT
        p.ProfessorID,
        p.ProfessorName

    FROM Professors p
    CROSS JOIN target t

    WHERE
        -- Same department
        p.ProfessorDepartment = t.ProfessorDepartment

        -- Cannot observe yourself
        AND p.ProfessorID <> t.ObserveeProfessorID

        -- Taught this course level within 4 semesters
        AND EXISTS (
            SELECT 1
            FROM TeachingAssignment ta
            JOIN Sections s
                ON s.SectionID = ta.SectionID
            JOIN Courses c
                ON c.CourseID = s.CourseID
            JOIN ranked_terms history_term
                ON history_term.TermID = s.TermID
            JOIN ranked_terms current_term
                ON current_term.TermID = t.TermID

            WHERE ta.ProfessorID = p.ProfessorID

              AND history_term.term_rank BETWEEN
                  current_term.term_rank
                  AND current_term.term_rank + 3

              AND LEFT(
                  SPLIT_PART(c.CourseCode, ' ', 2),
                  1
              ) = t.CourseLevel
        )

        -- No conflicting class during observation
        AND NOT EXISTS (
            SELECT 1
            FROM TeachingAssignment ta
            JOIN Sections s
                ON s.SectionID = ta.SectionID

            WHERE ta.ProfessorID = p.ProfessorID
              AND s.TermID = t.TermID

              -- Times overlap
              AND s.StartTime < t.EndTime
              AND s.EndTime > t.StartTime

              -- At least one meeting day overlaps
              AND EXISTS (
                  SELECT 1
                  FROM regexp_split_to_table(
                      UPPER(COALESCE(s.MeetingDays, '')),
                      ''
                  ) AS day_code(day_letter)

                  WHERE POSITION(
                      day_code.day_letter IN
                      UPPER(COALESCE(t.MeetingDays, ''))
                  ) > 0
              )
        )

        -- Missing schedule data cannot prove availability
        AND t.MeetingDays IS NOT NULL
        AND t.StartTime IS NOT NULL
        AND t.EndTime IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM TeachingAssignment ta
            JOIN Sections s
                ON s.SectionID = ta.SectionID
            WHERE ta.ProfessorID = p.ProfessorID
              AND s.TermID = t.TermID
              AND (
                  s.MeetingDays IS NULL
                  OR s.StartTime IS NULL
                  OR s.EndTime IS NULL
              )
        );
$$;


-- Observee can only sign up for a section they teach
ALTER TABLE ObservationSignup
    ADD CONSTRAINT fk_signup_observee_teaches_section
    FOREIGN KEY (SectionID, ObserveeProfessorID)
    REFERENCES TeachingAssignment (SectionID, ProfessorID);


--Filled out in accordance to the frontend
--Observations last forever
-- (currently on hold due to current observation criteria challenges)
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
-- Check Constraint to make sure observee matches on signup and observation
-- Check Constraint to make sure the observee is not the observer
CREATE OR REPLACE FUNCTION check_observation_consistency()
RETURNS TRIGGER AS $$
DECLARE
    signup_observee INT;
BEGIN
    SELECT ObserveeProfessorID
    INTO signup_observee
    FROM ObservationSignup
    WHERE SignupID = NEW.SignupID;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Observation signup does not exist';
    END IF;

    IF NEW.ObserveeID <> signup_observee THEN
        RAISE EXCEPTION
            'Observation observee must match its signup';
    END IF;

    IF NEW.ObserverProfessorID = NEW.ObserveeID THEN
        RAISE EXCEPTION
            'A professor cannot observe themselves';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_observation_consistency
BEFORE INSERT OR UPDATE ON Observation
FOR EACH ROW
EXECUTE FUNCTION check_observation_consistency();

-- Observations must be on or before the observation deadline, 
 --and it must be in the same term as current eval cycle

CREATE OR REPLACE FUNCTION check_observation_deadline()
RETURNS TRIGGER AS $$
DECLARE
    obs_deadline DATE;
    obs_date     DATE;
BEGIN
    SELECT ec.ObservationDeadLine
    INTO obs_deadline
    FROM ObservationSignup os
    JOIN EvaluationCycle ec ON ec.CycleID = os.CycleID
    WHERE os.SignupID = NEW.SignupID;
 
    obs_date := COALESCE(NEW.ScheduledDate, NEW.ObservationDate);
 
    IF obs_deadline IS NOT NULL
       AND obs_date IS NOT NULL
       AND obs_date > obs_deadline THEN
        RAISE EXCEPTION
            'Observation date % is after the observation deadline %',
            obs_date, obs_deadline;
    END IF;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER validate_observation_deadline
BEFORE INSERT OR UPDATE ON Observation
FOR EACH ROW
EXECUTE FUNCTION check_observation_deadline();

-- Observation can only exist of the observee accepted the observer's request

CREATE OR REPLACE FUNCTION check_observation_request_accepted()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM ObserverRequest orq
        WHERE orq.SignupID = NEW.SignupID
          AND orq.ObserverProfessorID = NEW.ObserverProfessorID
          AND orq.Status = 'Accepted'
    ) THEN
        RAISE EXCEPTION
            'Observee must accept the observer request before an observation can be created';
    END IF;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER validate_observation_request_accepted
BEFORE INSERT OR UPDATE ON Observation
FOR EACH ROW
EXECUTE FUNCTION check_observation_request_accepted();

--Post observation survey for database/technology
CREATE TABLE PostObservationSurveyResponse (
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
    foreign key (SignupID) references ObservationSignup(SignupID)
);

-- PostObservationSurveys must be on or before the PostObservationSurvey deadline, 
 --and it must be in the same term as current eval cycle

CREATE OR REPLACE FUNCTION check_survey_rules()
RETURNS TRIGGER AS $$
DECLARE
    signup_cycle INT;
    fb_deadline  DATE;
BEGIN
    SELECT CycleID
    INTO signup_cycle
    FROM ObservationSignup
    WHERE SignupID = NEW.SignupID;
 
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Survey signup does not exist';
    END IF;
 
    IF signup_cycle IS DISTINCT FROM NEW.CycleID THEN
        RAISE EXCEPTION 'Survey cycle must match its signup cycle';
    END IF;
 
    SELECT PostObservationFeedbackDeadLine
    INTO fb_deadline
    FROM EvaluationCycle
    WHERE CycleID = NEW.CycleID;
 
    IF NEW.SubmissionDate IS NOT NULL
       AND NEW.SubmissionDate > fb_deadline THEN
        RAISE EXCEPTION
            'Survey submitted % after the feedback deadline %',
            NEW.SubmissionDate, fb_deadline;
    END IF;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER validate_survey_rules
BEFORE INSERT OR UPDATE ON PostObservationSurveyResponse
FOR EACH ROW
EXECUTE FUNCTION check_survey_rules();

CREATE TABLE AppSurveyResponse (
    AppResponseID INT PRIMARY KEY,
    ObservationID INT NOT NULL,
    Role VARCHAR(20) NOT NULL
        CHECK (Role IN ('Observer', 'Observee')),
    AppImprovements TEXT,
    AppEnjoyments TEXT,
    SubmissionDate DATE,
    FOREIGN KEY (ObservationID) REFERENCES Observation(ObservationID),
    UNIQUE (ObservationID, Role)
);


-- AppSurveys must be on or before the AppSurvey deadline, 
 --and it must be in the same term as current eval cycle

CREATE OR REPLACE FUNCTION check_app_survey_rules()
RETURNS TRIGGER AS $$
DECLARE
    app_deadline DATE;
BEGIN
    SELECT ec.AppFeedbackDeadLine
    INTO app_deadline
    FROM Observation o
    JOIN ObservationSignup os ON os.SignupID = o.SignupID
    JOIN EvaluationCycle ec ON ec.CycleID = os.CycleID
    WHERE o.ObservationID = NEW.ObservationID;
 
    IF NEW.SubmissionDate IS NOT NULL
       AND app_deadline IS NOT NULL
       AND NEW.SubmissionDate > app_deadline THEN
        RAISE EXCEPTION
            'App survey submitted % after the app feedback deadline %',
            NEW.SubmissionDate, app_deadline;
    END IF;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER validate_app_survey_rules
BEFORE INSERT OR UPDATE ON AppSurveyResponse
FOR EACH ROW
EXECUTE FUNCTION check_app_survey_rules();


-- The table that currently holds all possible Criterions for the observations
CREATE TABLE EvaluationCriterion (
    CriterionID INT PRIMARY KEY,
    TemplateID INT NOT NULL,
    CriterionName VARCHAR(100) NOT NULL,
    Description TEXT,
    FOREIGN KEY (TemplateID) REFERENCES ObservationTemplate(TemplateID),
    UNIQUE (CriterionID, TemplateID)
);

-- The table that currently holds all ratings for criterions for the observations
CREATE TABLE ObservationCriterionRating (
    ObservationID INT NOT NULL,
    CriterionID INT NOT NULL,
    TemplateID INT NOT NULL,
    Rating INT,
        CONSTRAINT valid_rating_range CHECK (Rating BETWEEN 1 AND 6),
    Comments TEXT,
    PRIMARY KEY (ObservationID, CriterionID),
    FOREIGN KEY (ObservationID) REFERENCES Observation(ObservationID),
    FOREIGN KEY (CriterionID, TemplateID) REFERENCES EvaluationCriterion(CriterionID, TemplateID)
);
-- Check for the criterion existing in the observation, and check if it is between 1-6 (1 to N/A)
CREATE OR REPLACE FUNCTION check_criterion_template()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM Observation o
        JOIN EvaluationCriterion ec
          ON ec.TemplateID = o.TemplateID
        WHERE o.ObservationID = NEW.ObservationID
          AND ec.CriterionID = NEW.CriterionID
          AND ec.TemplateID = NEW.TemplateID
    ) THEN
        RAISE EXCEPTION
            'Criterion must belong to the observation template';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_criterion_template
BEFORE INSERT OR UPDATE ON ObservationCriterionRating
FOR EACH ROW
EXECUTE FUNCTION check_criterion_template();