-- AHC-218 Add view for due and overdue professor evaluations
-- This just creates the view
-- Evaluation frequency (SRS 6.2):
-- Assistant professors: annually.
-- Associate and full professors: every two years.

CREATE OR REPLACE VIEW ProfessorEvaluationStatus AS

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
    WHERE at.Semester IN ('Spring', 'Fall')
    ORDER BY at.YearNum DESC, SemesterOrder DESC
    LIMIT 1
),

LastEvaluation AS (
    SELECT
        o.ObserveeID AS ProfessorID,
        MAX(o.CompletedDate) AS LastEvaluationDate
    FROM Observation o
    WHERE o.Status = 'Completed'
      AND o.CompletedDate IS NOT NULL
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