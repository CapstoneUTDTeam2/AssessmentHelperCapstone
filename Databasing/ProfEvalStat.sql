-- AHC-218 Add view for due and overdue professor evaluations
-- This creates the status function and the view built on it
-- Evaluation frequency (SRS 6.2):
-- Assistant professors: annually.
-- Associate and full professors: every two years.

-- Pass a cycle to ignore its observations. That gives each professor's status
-- before that cycle's evaluations finished, which KPI 2.1 needs.
CREATE OR REPLACE FUNCTION professor_evaluation_status(
    p_ignore_cycle_id INT DEFAULT NULL
)
RETURNS TABLE (
    ProfessorID INT,
    ProfessorName VARCHAR,
    CurrentLevel VARCHAR,
    StartTermID INT,
    LastEvaluationDate DATE,
    FrequencyYears INT,
    NextDueYear INT,
    NextDueSemester TEXT,
    EvaluationStatus TEXT
)
LANGUAGE sql
STABLE
AS $$

WITH CurrentCycle AS (
    SELECT
        at.TermID,
        at.Semester,
        at.YearNum,
        CASE
            WHEN at.Semester = 'Spring' THEN 1
            WHEN at.Semester = 'Fall' THEN 2
        END AS SemesterOrder
    FROM EvaluationCycle ec
    JOIN AcademicTerm at ON ec.TermID = at.TermID
    WHERE ec.CycleID = current_cycle_id()
),

LastEvaluation AS (
    SELECT
        o.ObserveeID AS ProfessorID,
        MAX(o.CompletedDate) AS LastEvaluationDate
    FROM Observation o
    WHERE o.Status = 'Completed'
      AND o.CompletedDate IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM ObservationSignup os
          WHERE os.SignupID = o.SignupID
            AND os.CycleID = p_ignore_cycle_id
      )
    GROUP BY o.ObserveeID
),

ProfessorData AS (
    SELECT
        p.ProfessorID,
        p.ProfessorName,
        p.CurrentLevel,
        p.StartTermID,
        st.Semester AS StartSemester,
        st.YearNum AS StartYear,
        le.LastEvaluationDate,

        CASE
            WHEN p.CurrentLevel = 'Assistant Professor' THEN 1
            WHEN p.CurrentLevel IN (
                'Associate Professor', 'Full Professor'
            ) THEN 2
            ELSE NULL
        END AS FrequencyYears

    FROM Professors p
    LEFT JOIN AcademicTerm st ON p.StartTermID = st.TermID
    LEFT JOIN LastEvaluation le ON p.ProfessorID = le.ProfessorID
),

DueTerms AS (
    SELECT
        pd.*,

        CASE
            WHEN pd.LastEvaluationDate IS NOT NULL
            THEN EXTRACT(YEAR FROM pd.LastEvaluationDate)::INT
                 + pd.FrequencyYears
            ELSE NULL
        END AS NextDueYear,

        CASE
            WHEN EXTRACT(MONTH FROM pd.LastEvaluationDate)
                 BETWEEN 1 AND 5 THEN 'Spring'
            WHEN EXTRACT(MONTH FROM pd.LastEvaluationDate)
                 BETWEEN 8 AND 12 THEN 'Fall'
            ELSE NULL
        END AS NextDueSemester

    FROM ProfessorData pd
)

SELECT
    dt.ProfessorID,
    dt.ProfessorName,
    dt.CurrentLevel,
    dt.StartTermID,
    dt.LastEvaluationDate,
    dt.FrequencyYears,
    dt.NextDueYear,
    dt.NextDueSemester,

    CASE
        WHEN cc.TermID IS NULL THEN 'Unknown'

        WHEN dt.FrequencyYears IS NULL
             OR dt.StartTermID IS NULL THEN 'Unknown'

        WHEN dt.StartYear = cc.YearNum
             AND dt.StartSemester = cc.Semester
            THEN 'Not Due'

        WHEN dt.NextDueYear IS NULL
             OR dt.NextDueSemester IS NULL
            THEN 'Unknown'

        WHEN dt.NextDueYear < cc.YearNum
            THEN 'Overdue'

        -- Yearly evaluations are due in either semester of the calendar year.
        WHEN dt.NextDueYear = cc.YearNum
             AND dt.FrequencyYears = 1
            THEN 'Due'

        WHEN dt.NextDueYear = cc.YearNum
             AND dt.NextDueSemester = 'Spring'
             AND cc.Semester = 'Fall'
            THEN 'Overdue'

        WHEN dt.NextDueYear = cc.YearNum
             AND dt.NextDueSemester = cc.Semester
            THEN 'Due'

        ELSE 'Not Due'
    END AS EvaluationStatus

FROM DueTerms dt
CROSS JOIN CurrentCycle cc;

$$;

CREATE OR REPLACE VIEW ProfessorEvaluationStatus AS
SELECT
    s.ProfessorID,
    s.ProfessorName::VARCHAR(50) AS ProfessorName,
    s.CurrentLevel::VARCHAR(30) AS CurrentLevel,
    s.StartTermID,
    s.LastEvaluationDate,
    s.FrequencyYears,
    s.NextDueYear,
    s.NextDueSemester,
    s.EvaluationStatus
FROM professor_evaluation_status() s;