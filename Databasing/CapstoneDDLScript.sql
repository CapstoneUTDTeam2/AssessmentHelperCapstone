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
    FOREIGN KEY (TermID)
        REFERENCES AcademicTerm(TermID)
);

ALTER TABLE EvaluationCycle
    ADD CONSTRAINT valid_evaluation_deadline_order
    CHECK (
        SignUpDeadLine <= ObservationDeadLine
        AND ObservationDeadLine <= PostObservationFeedbackDeadLine
    ),
    ADD CONSTRAINT valid_app_feedback_deadline
    CHECK (
        AppFeedbackDeadLine >= ObservationDeadLine
    );

CREATE TABLE ObservationTemplate (
    TemplateID INT PRIMARY KEY,
    TemplateVersion VARCHAR(100),
    TemplateContent TEXT,
    LastUpdateDate DATE,
    LastUpdateTime TIME,
    isActive BOOLEAN,
    IsLocked BOOLEAN NOT NULL DEFAULT FALSE
);

-- NOW ObservationTemplate exists.
ALTER TABLE EvaluationCycle
    ADD COLUMN TemplateID INT
    REFERENCES ObservationTemplate(TemplateID);


-- EvaluationCriterionSectioner
CREATE TABLE EvaluationCriterionSection (
    SectionID INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    TemplateID INT NOT NULL,
    SectionName VARCHAR(100) NOT NULL,
    DisplayOrder INT NOT NULL,

    FOREIGN KEY (TemplateID) REFERENCES ObservationTemplate(TemplateID),

    UNIQUE (SectionID, TemplateID),
    UNIQUE (TemplateID, DisplayOrder)
);

CREATE TABLE ObservationSignup (
    SignupID INT PRIMARY KEY,
    CycleID INT NOT NULL,
    ObserveeProfessorID INT NOT NULL,
    SectionID INT NOT NULL,
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
    SignupID INT NOT NULL,
    ObserverProfessorID INT NOT NULL,
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

CREATE TABLE TeachingAssignment (
    SectionID INT,
    ProfessorID INT,
    PRIMARY KEY (SectionID, ProfessorID),
    foreign key (SectionID) references Sections(SectionID),
    foreign key (ProfessorID) references Professors(ProfessorID)
);


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
    SignupID INT NOT NULL,
    ObservationDate DATE,
    ObserverProfessorID INT NOT NULL,
    TemplateID INT NOT NULL,
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


-- Prevent completed reports from being changed or deleted
CREATE OR REPLACE FUNCTION protect_completed_observation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.Status = 'Completed' THEN
            RAISE EXCEPTION
                'Cannot delete a completed observation report';
        END IF;

        RETURN OLD;
    END IF;

    -- Prevent changes to an already completed report
    IF OLD.Status = 'Completed'
       AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION
            'Cannot modify a completed observation report';
    END IF;

    -- Require a completion date when completing a report
    IF NEW.Status = 'Completed'
       AND NEW.CompletedDate IS NULL THEN
        RAISE EXCEPTION
            'Completed observations require a completion date';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_completed_observation
BEFORE UPDATE OR DELETE ON Observation
FOR EACH ROW
EXECUTE FUNCTION protect_completed_observation();



CREATE OR REPLACE FUNCTION check_observation_cycle_template()
RETURNS TRIGGER AS $$
DECLARE
    expected_template INT;
BEGIN
    SELECT ec.TemplateID
    INTO expected_template
    FROM ObservationSignup os
    JOIN EvaluationCycle ec
        ON ec.CycleID = os.CycleID
    WHERE os.SignupID = NEW.SignupID;

    IF expected_template IS NULL
       OR NEW.TemplateID IS DISTINCT FROM expected_template
    THEN
        RAISE EXCEPTION
            'Observation must use its evaluation cycle template';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_observation_cycle_template
BEFORE INSERT OR UPDATE ON Observation
FOR EACH ROW
EXECUTE FUNCTION check_observation_cycle_template();

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
    ObserverSigned BOOLEAN NOT NULL DEFAULT FALSE,
    ObserveeSigned BOOLEAN NOT NULL DEFAULT FALSE;
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

ALTER TABLE EvaluationCriterion
ADD COLUMN SectionID INT,
ADD COLUMN DisplayOrder INT NOT NULL DEFAULT 0,
ADD COLUMN Guidance TEXT,
ADD COLUMN AppliesTo VARCHAR(20) NOT NULL DEFAULT 'All',
ADD COLUMN IsActive BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IsRequired BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN NotesOnLowRating BOOLEAN NOT NULL DEFAULT TRUE,
ADD CONSTRAINT valid_criterion_modality
    CHECK (AppliesTo IN (
        'All',
        'In person',
        'Online / Hybrid'
    )),
ADD CONSTRAINT fk_criterion_section
    FOREIGN KEY (SectionID, TemplateID)
    REFERENCES EvaluationCriterionSection(SectionID, TemplateID);

-- Small Frontend Table to allow bulleting the criterions
CREATE TABLE EvaluationCriterionBullet (
    CriterionID INT NOT NULL,
    BulletOrder INT NOT NULL,
    BulletText TEXT NOT NULL,

    PRIMARY KEY (CriterionID, BulletOrder),

    FOREIGN KEY (CriterionID)
        REFERENCES EvaluationCriterion(CriterionID)
);



CREATE OR REPLACE FUNCTION prevent_locked_bullet_changes()
RETURNS TRIGGER AS $$
DECLARE
    template_locked BOOLEAN;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT ot.IsLocked
        INTO template_locked
        FROM EvaluationCriterion ec
        JOIN ObservationTemplate ot
            ON ot.TemplateID = ec.TemplateID
        WHERE ec.CriterionID = OLD.CriterionID
        FOR UPDATE OF ot;

        IF template_locked THEN
            RAISE EXCEPTION
                'Cannot modify bullet points of a locked template';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT ot.IsLocked
        INTO template_locked
        FROM EvaluationCriterion ec
        JOIN ObservationTemplate ot
            ON ot.TemplateID = ec.TemplateID
        WHERE ec.CriterionID = NEW.CriterionID
        FOR UPDATE OF ot;

        IF template_locked THEN
            RAISE EXCEPTION
                'Cannot add bullet points to a locked template';
        END IF;

        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER protect_locked_bullets
BEFORE INSERT OR UPDATE OR DELETE
ON EvaluationCriterionBullet
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_bullet_changes();


CREATE TABLE ObserverEnrollment (
    ProfessorID INT NOT NULL,
    CycleID INT NOT NULL,
    EnrollmentDate DATE NOT NULL DEFAULT CURRENT_DATE,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',

    PRIMARY KEY (ProfessorID, CycleID),

    FOREIGN KEY (ProfessorID)
        REFERENCES Professors(ProfessorID),

    FOREIGN KEY (CycleID)
        REFERENCES EvaluationCycle(CycleID),

    CHECK (Status IN ('Active', 'Withdrawn'))
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


CREATE OR REPLACE FUNCTION protect_completed_ratings()
RETURNS TRIGGER AS $$
DECLARE
    observation_status VARCHAR(20);
    target_observation_id INT;
BEGIN
    -- For UPDATE, both the old and new observation
    -- must be checked, in case a rating is moved.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT Status
        INTO observation_status
        FROM Observation
        WHERE ObservationID = OLD.ObservationID
        FOR UPDATE;

        IF observation_status = 'Completed' THEN
            RAISE EXCEPTION
                'Cannot change ratings of a completed observation';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        target_observation_id := NEW.ObservationID;

        SELECT Status
        INTO observation_status
        FROM Observation
        WHERE ObservationID = target_observation_id
        FOR UPDATE;

        IF observation_status = 'Completed' THEN
            RAISE EXCEPTION
                'Cannot add or change ratings of a completed observation';
        END IF;

        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_completed_ratings
BEFORE INSERT OR UPDATE OR DELETE
ON ObservationCriterionRating
FOR EACH ROW
EXECUTE FUNCTION protect_completed_ratings();

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

CREATE OR REPLACE FUNCTION lock_submitted_template()
RETURNS TRIGGER AS $$
DECLARE
    cycle_template_id INT;
BEGIN
    SELECT ec.TemplateID
    INTO cycle_template_id
    FROM ObservationSignup os
    JOIN EvaluationCycle ec
        ON ec.CycleID = os.CycleID
    WHERE os.SignupID = NEW.SignupID;

    IF cycle_template_id IS NULL THEN
        RAISE EXCEPTION
            'Evaluation cycle has no assigned template';
    END IF;

    IF NEW.TemplateID IS DISTINCT FROM cycle_template_id THEN
        RAISE EXCEPTION
            'Observation template must match cycle template';
    END IF;

    UPDATE ObservationTemplate
    SET IsLocked = TRUE
    WHERE TemplateID = cycle_template_id
        AND IsLocked = FALSE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lock_template_on_completion
AFTER INSERT OR UPDATE OF Status, CompletedDate
ON Observation
FOR EACH ROW
WHEN (
    NEW.Status = 'Completed'
    AND NEW.CompletedDate IS NOT NULL
)
EXECUTE FUNCTION lock_submitted_template();


CREATE OR REPLACE FUNCTION prevent_locked_template_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.IsLocked THEN
            RAISE EXCEPTION
                'Cannot delete a locked observation template';
        END IF;

        RETURN OLD;
    END IF;

    IF OLD.IsLocked THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION
                'Cannot modify a locked observation template';
        END IF;
    END IF;

    -- A locked template cannot be unlocked.
    IF OLD.IsLocked AND NOT NEW.IsLocked THEN
        RAISE EXCEPTION
            'Cannot unlock an observation template';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_locked_template
BEFORE UPDATE OR DELETE ON ObservationTemplate
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_template_changes();



CREATE OR REPLACE FUNCTION prevent_locked_criterion_changes()
RETURNS TRIGGER AS $$
DECLARE
    template_locked BOOLEAN;
BEGIN
    -- Check the original template on UPDATE or DELETE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT IsLocked
        INTO template_locked
        FROM ObservationTemplate
        WHERE TemplateID = OLD.TemplateID
        FOR UPDATE;

        IF template_locked THEN
            RAISE EXCEPTION
                'Cannot modify criteria of a locked template';
        END IF;
    END IF;

    -- Check the destination template on INSERT or UPDATE
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT IsLocked
        INTO template_locked
        FROM ObservationTemplate
        WHERE TemplateID = NEW.TemplateID
        FOR UPDATE;

        IF template_locked THEN
            RAISE EXCEPTION
                'Cannot add or modify criteria in a locked template';
        END IF;

        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER protect_locked_criteria
BEFORE INSERT OR UPDATE OR DELETE
ON EvaluationCriterion
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_criterion_changes();

CREATE TRIGGER protect_locked_criterion_sections
BEFORE INSERT OR UPDATE OR DELETE
ON EvaluationCriterionSection
FOR EACH ROW
EXECUTE FUNCTION prevent_locked_criterion_changes();


CREATE OR REPLACE FUNCTION prevent_cycle_template_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.TemplateID IS DISTINCT FROM OLD.TemplateID
       AND EXISTS (
           SELECT 1
           FROM ObservationSignup os
           JOIN Observation o
               ON o.SignupID = os.SignupID
           WHERE os.CycleID = OLD.CycleID
       )
    THEN
        RAISE EXCEPTION
            'Cannot change the template of a cycle with existing observations';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_cycle_template
BEFORE UPDATE OF TemplateID
ON EvaluationCycle
FOR EACH ROW
EXECUTE FUNCTION prevent_cycle_template_changes();



-- Regular weekly availability for observers
CREATE TABLE ObserverAvailability (
    ProfessorID INT NOT NULL,
    CycleID INT NOT NULL,
    Weekday CHAR(1) NOT NULL,
    StartTime TIME NOT NULL,
    EndTime TIME NOT NULL,

    PRIMARY KEY (ProfessorID, CycleID, Weekday),

    FOREIGN KEY (ProfessorID)
        REFERENCES Professors(ProfessorID),

    FOREIGN KEY (CycleID)
        REFERENCES EvaluationCycle(CycleID),

    CHECK (Weekday IN ('M', 'T', 'W', 'R', 'F')),
    CHECK (StartTime < EndTime)
);

-- Individual dates an observer cannot observe
CREATE TABLE ObserverUnavailableDate (
    ProfessorID INT NOT NULL,
    CycleID INT NOT NULL,
    UnavailableDate DATE NOT NULL,

    PRIMARY KEY (
        ProfessorID,
        CycleID,
        UnavailableDate
    ),

    FOREIGN KEY (ProfessorID)
        REFERENCES Professors(ProfessorID),

    FOREIGN KEY (CycleID)
        REFERENCES EvaluationCycle(CycleID)
);


CREATE TABLE SignupPreferredDate (
    SignupID INT NOT NULL,
    PreferredDate DATE NOT NULL,

    PRIMARY KEY (SignupID, PreferredDate),

    FOREIGN KEY (SignupID)
        REFERENCES ObservationSignup(SignupID)
        ON DELETE CASCADE
);

-- Observer list saved when the AC starts observer selection, so everyone sees the same names
CREATE TABLE SignupObserverList (
    SignupID INT NOT NULL,
    ObserverProfessorID INT NOT NULL,
    SavedDate DATE NOT NULL DEFAULT CURRENT_DATE,

    PRIMARY KEY (SignupID, ObserverProfessorID),

    FOREIGN KEY (SignupID)
        REFERENCES ObservationSignup(SignupID)
        ON DELETE CASCADE,

    FOREIGN KEY (ObserverProfessorID)
        REFERENCES Professors(ProfessorID)
);

--For each potential observer:
-- 1. Same department, not the observee.
-- 2. Taught the same course level within four Fall/Spring semesters.
-- 3. Signed up with regular availability covering the class's start and end time.
-- 4. Has at least one preferred observation date that isn't marked unavailable.
-- 5. Is not teaching another section that overlaps that particular date and time.

CREATE OR REPLACE FUNCTION get_eligible_observers(
    p_signup_id INT
)
RETURNS TABLE (
    ProfessorID INT,
    ProfessorName VARCHAR(50)
)
LANGUAGE sql
AS $$
    -- Four regular semesters, excluding Summer
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

    -- Information about the class being observed
    target AS (
        SELECT
            os.SignupID,
            os.CycleID,
            os.ObserveeProfessorID,
            p.ProfessorDepartment,
            s.TermID,
            s.MeetingDays,
            s.StartTime,
            s.EndTime,

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

        -- Taught same course level within last 4 semesters
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

        -- Professor must have signed up to observe
            AND EXISTS (
                SELECT 1
                FROM ObserverEnrollment oe
                WHERE oe.ProfessorID = p.ProfessorID
                AND oe.CycleID = t.CycleID
                AND oe.Status = 'Active'
            )

        -- Observer must be available on at least one
        -- of the observee's preferred dates
        AND EXISTS (
            SELECT 1
            FROM SignupPreferredDate spd

            -- Convert the observation date to a day code
            CROSS JOIN LATERAL (
                SELECT CASE EXTRACT(
                    ISODOW FROM spd.PreferredDate
                )
                    WHEN 1 THEN 'M'
                    WHEN 2 THEN 'T'
                    WHEN 3 THEN 'W'
                    WHEN 4 THEN 'R'
                    WHEN 5 THEN 'F'
                END AS DayLetter
            ) weekday

            JOIN ObserverAvailability oa
                ON oa.ProfessorID = p.ProfessorID
               AND oa.CycleID = t.CycleID
               AND oa.Weekday = weekday.DayLetter

            WHERE spd.SignupID = t.SignupID

              -- Date must match the class's meeting day
              AND POSITION(
                  weekday.DayLetter IN t.MeetingDays
              ) > 0

              -- Observer's hours must cover the class
              AND oa.StartTime <= t.StartTime
              AND oa.EndTime >= t.EndTime

              -- Observer did not mark date unavailable
              AND NOT EXISTS (
                  SELECT 1
                  FROM ObserverUnavailableDate oud
                  WHERE oud.ProfessorID = p.ProfessorID
                    AND oud.CycleID = t.CycleID
                    AND oud.UnavailableDate =
                        spd.PreferredDate
              )

              -- Observer is not teaching a conflicting class
              AND NOT EXISTS (
                  SELECT 1
                  FROM TeachingAssignment ta
                  JOIN Sections s
                      ON s.SectionID = ta.SectionID

                  WHERE ta.ProfessorID = p.ProfessorID
                    AND s.TermID = t.TermID

                    -- Same weekday
                    AND POSITION(
                        weekday.DayLetter IN s.MeetingDays
                    ) > 0

                    -- Overlapping time
                    AND s.StartTime < t.EndTime
                    AND s.EndTime > t.StartTime
              )
        )

        
    -- Target class needs a valid schedule
    AND NULLIF(TRIM(t.MeetingDays), '') IS NOT NULL
    AND t.StartTime IS NOT NULL
    AND t.EndTime IS NOT NULL

    -- Candidate observer cannot have incomplete
    -- teaching schedules in this evaluation term
    AND NOT EXISTS (
        SELECT 1
        FROM TeachingAssignment ta
        JOIN Sections s
            ON s.SectionID = ta.SectionID
        WHERE ta.ProfessorID = p.ProfessorID
        AND s.TermID = t.TermID
        AND (
            NULLIF(TRIM(s.MeetingDays), '') IS NULL
            OR s.StartTime IS NULL
            OR s.EndTime IS NULL
        )
    );

$$;

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
