-- =====================================================================
-- CapstoneTests.sql
-- Run after: DDL -> DML -> CapstoneDDLAdditions.sql (incl. its seed data).
-- Each negative test tries a bad insert and expects an error (PASS).
-- If the insert succeeds, the block raises FAIL, which also rolls the
-- bad row back, so nothing is left behind. Watch the NOTICE output.
--
-- IDs (900+) are test-only. The "valid" IDs used (signup 1, prof 1/2,
-- section 1, cycle 1/2, observation 1, criteria 1/4) come from the seed
-- data; if your data changes, adjust those.
-- =====================================================================
-- Claude suggestion (Feel free to delete on final)

-- T1: Signup for a section the professor doesn't teach -> composite FK
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO ObservationSignup
            (SignupID, CycleID, ObserveeProfessorID, SectionID, SignupDate, Status)
        VALUES (901, 2, 4, 1, '2026-09-05', 'Pending');  -- prof 4 doesn't teach section 1
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T1: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T1: professor signed up for a section they do not teach'; END IF;
END $$;

-- T2: Signup whose section term doesn't match the cycle term
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO ObservationSignup
            (SignupID, CycleID, ObserveeProfessorID, SectionID, SignupDate, Status)
        VALUES (902, 1, 1, 1, '2026-01-10', 'Pending');  -- cycle 1 = Spring 2026, section 1 = Fall 2026
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T2: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T2: section/cycle term mismatch was allowed'; END IF;
END $$;

-- T3: Signup after the signup deadline
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO ObservationSignup
            (SignupID, CycleID, ObserveeProfessorID, SectionID, SignupDate, Status)
        VALUES (903, 2, 1, 1, '2026-09-20', 'Pending');  -- cycle 2 deadline is 2026-09-15
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T3: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T3: late signup was allowed'; END IF;
END $$;

-- T4: Observation whose observee doesn't match its signup
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO Observation
            (ObservationID, SignupID, ObserverProfessorID, TemplateID,
             ScheduledDate, Status, ObserveeID)
        VALUES (904, 1, 3, 2, '2026-10-15', 'Scheduled', 2);  -- signup 1 observee is prof 1, not 2
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T4: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T4: observee/signup mismatch was allowed'; END IF;
END $$;

-- T5: Professor observing themselves
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO Observation
            (ObservationID, SignupID, ObserverProfessorID, TemplateID,
             ScheduledDate, Status, ObserveeID)
        VALUES (905, 1, 1, 2, '2026-10-15', 'Scheduled', 1);
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T5: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T5: self-observation was allowed'; END IF;
END $$;

-- T6: Observation scheduled after the observation deadline
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO Observation
            (ObservationID, SignupID, ObserverProfessorID, TemplateID,
             ScheduledDate, Status, ObserveeID)
        VALUES (906, 1, 2, 2, '2026-12-01', 'Scheduled', 1);  -- cycle 2 deadline is 2026-11-15
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T6: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T6: late observation was allowed'; END IF;
END $$;

-- T7: Rating a criterion that belongs to a different template
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO ObservationCriterionRating
            (ObservationID, CriterionID, TemplateID, Rating, Comments)
        VALUES (1, 1, 1, 3, 'wrong template');  -- obs 1 uses template 2, criterion 1 is template 1
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T7: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T7: wrong-template criterion was allowed'; END IF;
END $$;

-- T8: Rating above the allowed range (7)
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE ObservationCriterionRating
        SET Rating = 7
        WHERE ObservationID = 1 AND CriterionID = 4;
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T8: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T8: rating 7 was allowed'; END IF;
END $$;

-- T9: Rating below the allowed range (0)
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE ObservationCriterionRating
        SET Rating = 0
        WHERE ObservationID = 1 AND CriterionID = 4;
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T9: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T9: rating 0 was allowed'; END IF;
END $$;

-- T10: Survey submitted after the feedback deadline
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO PostObservationSurveyResponse
            (SurveyResponseID, CycleID, ProfessorID, SignupID, Role,
             SubmissionDate, ProcessStatus)
        VALUES (910, 2, 1, 1, 'Observee', '2026-12-20', 'Pending');  -- cycle 2 post-observation deadline is 2026-12-15
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T10: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T10: late survey was allowed'; END IF;
END $$;

-- T11: Survey whose cycle doesn't match its signup's cycle
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO PostObservationSurveyResponse
            (SurveyResponseID, CycleID, ProfessorID, SignupID, Role,
             SubmissionDate, ProcessStatus)
        VALUES (911, 1, 1, 1, 'Observee', '2026-01-15', 'Pending');  -- signup 1 is in cycle 2
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T11: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T11: survey/signup cycle mismatch was allowed'; END IF;
END $$;

-- T12 (positive): a valid observation SHOULD insert. Rolled back afterwards.
DO $$
BEGIN
    INSERT INTO Observation
        (ObservationID, SignupID, ObserverProfessorID, TemplateID,
         ScheduledDate, Status, ObserveeID)
    VALUES (912, 1, 2, 2, '2026-11-01', 'Scheduled', 1);
    RAISE NOTICE 'PASS T12: valid observation accepted';
    RAISE EXCEPTION 'rolling back T12 test row';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rolling back T12 test row' THEN
        RAISE EXCEPTION 'FAIL T12: valid observation rejected: %', SQLERRM;
    END IF;
END $$;

-- T13: App survey submitted after the app feedback deadline
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO AppSurveyResponse
            (AppResponseID, ObservationID, Role, AppImprovements, AppEnjoyments, SubmissionDate)
        VALUES (913, 1, 'Observee', 'x', 'x', '2027-01-01');  -- cycle 2 app deadline is 2026-12-15
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T13: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T13: late app survey was allowed'; END IF;
END $$;

-- T14: Observation with no accepted request from that observer
DO $$
DECLARE ok BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO Observation
            (ObservationID, SignupID, ObserverProfessorID, TemplateID,
             ScheduledDate, Status, ObserveeID)
        VALUES (914, 1, 3, 2, '2026-10-30', 'Scheduled', 1);  -- prof 3 never requested/was accepted on signup 1
    EXCEPTION WHEN OTHERS THEN
        ok := TRUE; RAISE NOTICE 'PASS T14: %', SQLERRM;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL T14: observation without accepted request was allowed'; END IF;
END $$;


-- ---------------------------------------------------------------------
-- Detection queries: should all return ZERO rows once constraints are on.
-- ---------------------------------------------------------------------

-- Signups where the professor doesn't teach the section
SELECT os.SignupID
FROM ObservationSignup os
LEFT JOIN TeachingAssignment ta
  ON ta.SectionID = os.SectionID AND ta.ProfessorID = os.ObserveeProfessorID
WHERE ta.ProfessorID IS NULL;

-- Observations whose observee doesn't match the signup
SELECT o.ObservationID
FROM Observation o
JOIN ObservationSignup os ON os.SignupID = o.SignupID
WHERE o.ObserveeID <> os.ObserveeProfessorID;

-- Ratings whose criterion belongs to another template than the observation
SELECT r.ObservationID, r.CriterionID
FROM ObservationCriterionRating r
JOIN Observation o ON o.ObservationID = r.ObservationID
JOIN EvaluationCriterion ec ON ec.CriterionID = r.CriterionID
WHERE o.TemplateID <> ec.TemplateID;

-- Signups whose section term differs from the cycle term
SELECT os.SignupID
FROM ObservationSignup os
JOIN EvaluationCycle ec ON ec.CycleID = os.CycleID
JOIN Sections s ON s.SectionID = os.SectionID
WHERE s.TermID <> ec.TermID;

--Test for complted reports and template locks
SELECT
    o.ObservationID,
    o.Status,
    o.CompletedDate,
    ot.TemplateID,
    ot.TemplateVersion,
    ot.IsLocked
FROM Observation o
JOIN ObservationTemplate ot
    ON ot.TemplateID = o.TemplateID
WHERE o.Status = 'Completed';