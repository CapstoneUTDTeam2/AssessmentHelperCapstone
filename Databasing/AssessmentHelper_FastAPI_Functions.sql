-- Assessment Helper / FastAPI read-function library
-- Generated from the 46 DQL statements supplied by the user.
-- Each function returns SETOF JSONB: one JSON object per row.
-- Example: SELECT * FROM get_teacher_profile(3);
-- FastAPI/SQLAlchemy: session.execute(text("SELECT * FROM get_teacher_profile(:id)"), {"id": 3}).scalars().all()
-- Deploy AFTER tables, get_eligible_observers(integer), and all referenced views.
-- Functions are read-only. They do NOT create API authorization rules.
-- Do not expose diagnostic/admin functions to regular faculty without role checks.
-- PostgreSQL's unquoted identifiers are folded to lowercase in JSON keys.
-- STABLE is appropriate for reads; random eligible selection is VOLATILE.
--CoAuthoured by Chat-GPT, planned test

-- 01. get_professor_departments
CREATE OR REPLACE FUNCTION get_professor_departments()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorName, p.CurrentLevel, d.DepartmentName FROM Professors p JOIN Department d ON p.ProfessorDepartment = d.DepartmentID
    ) AS result_row;
$function$;

-- 02. get_professor_course_section_terms
CREATE OR REPLACE FUNCTION get_professor_course_section_terms()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorName, c.CourseCode, c.CourseName, s.SectionName, t.Semester, t.YearNum FROM TeachingAssignment ta JOIN Professors p ON ta.ProfessorID=p.ProfessorID JOIN Sections s ON ta.SectionID=s.SectionID JOIN Courses c ON s.CourseID=c.CourseID JOIN AcademicTerm t ON s.TermID=t.TermID ORDER BY p.ProfessorName
    ) AS result_row;
$function$;

-- 03. get_cycle_signup_sections
CREATE OR REPLACE FUNCTION get_cycle_signup_sections()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT ec.CycleID,t.Semester,t.YearNum,p.ProfessorName AS Observee,c.CourseCode,s.SectionName,os.Status FROM ObservationSignup os JOIN EvaluationCycle ec ON os.CycleID=ec.CycleID JOIN AcademicTerm t ON ec.TermID=t.TermID JOIN Professors p ON os.ObserveeProfessorID=p.ProfessorID JOIN Sections s ON os.SectionID=s.SectionID JOIN Courses c ON s.CourseID=c.CourseID
    ) AS result_row;
$function$;

-- 04. get_signup_observer_requests
CREATE OR REPLACE FUNCTION get_signup_observer_requests()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT os.SignupID,observee.ProfessorName AS Observee,observer.ProfessorName AS Observer,orq.Status AS RequestStatus,orq.ExpirationDate,orq.ExpirationTime FROM ObserverRequest orq JOIN ObservationSignup os ON orq.SignupID=os.SignupID JOIN Professors observee ON os.ObserveeProfessorID=observee.ProfessorID JOIN Professors observer ON orq.ObserverProfessorID=observer.ProfessorID
    ) AS result_row;
$function$;

-- 05. get_all_observation_history
CREATE OR REPLACE FUNCTION get_all_observation_history()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT o.ObservationID,observee.ProfessorName AS Observee,observer.ProfessorName AS Observer,c.CourseCode,c.CourseName,o.ScheduledDate,o.ScheduledTime,ot.TemplateVersion,o.Status,o.Notes FROM Observation o JOIN ObservationSignup os ON o.SignupID=os.SignupID JOIN Professors observee ON o.ObserveeID=observee.ProfessorID JOIN Professors observer ON o.ObserverProfessorID=observer.ProfessorID JOIN Sections s ON os.SectionID=s.SectionID JOIN Courses c ON s.CourseID=c.CourseID JOIN ObservationTemplate ot ON o.TemplateID=ot.TemplateID
    ) AS result_row;
$function$;

-- 06. get_post_observation_survey_connections
CREATE OR REPLACE FUNCTION get_post_observation_survey_connections()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT sr.SurveyResponseID,p.ProfessorName,ec.CycleID,sr.Role,sr.ProcessStatus,sr.Difficulties,sr.ImprovementConditions FROM PostObservationSurveyResponse sr JOIN Professors p ON sr.ProfessorID=p.ProfessorID JOIN EvaluationCycle ec ON sr.CycleID=ec.CycleID JOIN ObservationSignup os ON sr.SignupID=os.SignupID
    ) AS result_row;
$function$;

-- 07. diagnose_sections_without_professors
CREATE OR REPLACE FUNCTION diagnose_sections_without_professors()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT s.SectionID,s.SectionName,c.CourseCode FROM Sections s JOIN Courses c ON s.CourseID=c.CourseID LEFT JOIN TeachingAssignment ta ON s.SectionID=ta.SectionID WHERE ta.SectionID IS NULL
    ) AS result_row;
$function$;

-- 08. diagnose_professors_without_teaching_assignments
CREATE OR REPLACE FUNCTION diagnose_professors_without_teaching_assignments()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorID,p.ProfessorName FROM Professors p LEFT JOIN TeachingAssignment ta ON p.ProfessorID=ta.ProfessorID WHERE ta.ProfessorID IS NULL
    ) AS result_row;
$function$;

-- 09. diagnose_signups_without_requests
CREATE OR REPLACE FUNCTION diagnose_signups_without_requests()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT os.SignupID,p.ProfessorName AS Observee FROM ObservationSignup os JOIN Professors p ON os.ObserveeProfessorID=p.ProfessorID LEFT JOIN ObserverRequest orq ON os.SignupID=orq.SignupID WHERE orq.SignupID IS NULL
    ) AS result_row;
$function$;

-- 10. get_professor_last_evaluations
CREATE OR REPLACE FUNCTION get_professor_last_evaluations()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorID,p.ProfessorName,MAX(o.CompletedDate) AS LastEvaluationDate FROM Professors p LEFT JOIN Observation o ON p.ProfessorID=o.ObserveeID AND o.Status='Completed' AND o.CompletedDate IS NOT NULL GROUP BY p.ProfessorID,p.ProfessorName ORDER BY p.ProfessorName
    ) AS result_row;
$function$;

-- 11. diagnose_signups_without_teaching_assignment
CREATE OR REPLACE FUNCTION diagnose_signups_without_teaching_assignment()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT os.SignupID,p.ProfessorName AS Observee,c.CourseCode,s.SectionName FROM ObservationSignup os JOIN Professors p ON p.ProfessorID=os.ObserveeProfessorID JOIN Sections s ON s.SectionID=os.SectionID JOIN Courses c ON c.CourseID=s.CourseID LEFT JOIN TeachingAssignment ta ON ta.ProfessorID=os.ObserveeProfessorID AND ta.SectionID=os.SectionID WHERE ta.ProfessorID IS NULL
    ) AS result_row;
$function$;

-- 12. diagnose_observation_observee_mismatches
CREATE OR REPLACE FUNCTION diagnose_observation_observee_mismatches()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT o.ObservationID,o.SignupID,o.ObserveeID AS ObservationObservee,os.ObserveeProfessorID AS SignupObservee FROM Observation o JOIN ObservationSignup os ON os.SignupID=o.SignupID WHERE o.ObserveeID<>os.ObserveeProfessorID
    ) AS result_row;
$function$;

-- 13. diagnose_criterion_template_mismatches
CREATE OR REPLACE FUNCTION diagnose_criterion_template_mismatches()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT o.ObservationID,o.TemplateID AS ObservationTemplate,ecr.CriterionID,ec.TemplateID AS CriterionTemplate FROM ObservationCriterionRating ecr JOIN Observation o ON o.ObservationID=ecr.ObservationID JOIN EvaluationCriterion ec ON ec.CriterionID=ecr.CriterionID WHERE o.TemplateID<>ec.TemplateID
    ) AS result_row;
$function$;

-- 14. diagnose_signup_term_mismatches
CREATE OR REPLACE FUNCTION diagnose_signup_term_mismatches()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT os.SignupID FROM ObservationSignup os JOIN EvaluationCycle ec ON ec.CycleID=os.CycleID JOIN Sections s ON s.SectionID=os.SectionID WHERE s.TermID<>ec.TermID
    ) AS result_row;
$function$;

-- 15. diagnose_signups_without_eligible_observers
CREATE OR REPLACE FUNCTION diagnose_signups_without_eligible_observers()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT os.SignupID,os.ObserveeProfessorID,COUNT(e.ProfessorID) AS EligibleCount FROM ObservationSignup os LEFT JOIN LATERAL get_eligible_observers(os.SignupID) e ON TRUE GROUP BY os.SignupID,os.ObserveeProfessorID HAVING COUNT(e.ProfessorID)=0
    ) AS result_row;
$function$;

-- 16. get_random_eligible_observers | Random selection: VOLATILE because RANDOM() is used.
CREATE OR REPLACE FUNCTION get_random_eligible_observers(p_signup_id integer, p_limit integer DEFAULT 5)
RETURNS SETOF jsonb
LANGUAGE sql
VOLATILE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM get_eligible_observers(p_signup_id) ORDER BY RANDOM() LIMIT GREATEST(0, LEAST(p_limit, 100))
    ) AS result_row;
$function$;

-- 17. get_eligible_observer_counts
CREATE OR REPLACE FUNCTION get_eligible_observer_counts()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT os.SignupID,COUNT(e.ProfessorID) AS EligibleCount FROM ObservationSignup os LEFT JOIN LATERAL get_eligible_observers(os.SignupID) e ON TRUE GROUP BY os.SignupID ORDER BY os.SignupID
    ) AS result_row;
$function$;

-- 18. get_evaluation_cycle_info
CREATE OR REPLACE FUNCTION get_evaluation_cycle_info(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT ec.CycleID,ec.TermID,t.Semester,t.YearNum,ec.SignUpDeadLine,ec.ObservationDeadLine,ec.PostObservationFeedbackDeadLine,ec.AppFeedbackDeadLine FROM EvaluationCycle ec JOIN AcademicTerm t ON t.TermID=ec.TermID WHERE ec.CycleID=p_cycle_id
    ) AS result_row;
$function$;

-- 19. get_course_overview_for_term
CREATE OR REPLACE FUNCTION get_course_overview_for_term(p_term_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM CourseOverview WHERE TermID=p_term_id ORDER BY CourseCode
    ) AS result_row;
$function$;

-- 20. get_problematic_signup_coverage
CREATE OR REPLACE FUNCTION get_problematic_signup_coverage()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM SignupObserverCoverage WHERE EligibleCount=0
    ) AS result_row;
$function$;

-- 21. get_signup_coverage_for_cycle
CREATE OR REPLACE FUNCTION get_signup_coverage_for_cycle(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM SignupObserverCoverage WHERE CycleID=p_cycle_id
    ) AS result_row;
$function$;

-- 22. get_pending_observer_invitations
CREATE OR REPLACE FUNCTION get_pending_observer_invitations(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM ProfessorObserverInvitations WHERE ObserverProfessorID=p_professor_id AND RequestStatus='Pending' ORDER BY RequestDate DESC
    ) AS result_row;
$function$;

-- 23. get_upcoming_observations_as_observee
CREATE OR REPLACE FUNCTION get_upcoming_observations_as_observee(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM ProfessorObservationDashboard WHERE ObserveeID=p_professor_id AND ScheduledDate>=CURRENT_DATE AND ObservationStatus<>'Completed' ORDER BY ScheduledDate,ScheduledTime
    ) AS result_row;
$function$;

-- 24. get_completed_observations_as_observee
CREATE OR REPLACE FUNCTION get_completed_observations_as_observee(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM ProfessorObservationDashboard WHERE ObserveeID=p_professor_id AND ObservationStatus='Completed' ORDER BY CompletedDate DESC
    ) AS result_row;
$function$;

-- 25. get_professor_course_schedule
CREATE OR REPLACE FUNCTION get_professor_course_schedule(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM ProfessorCourseSchedule WHERE ProfessorID=p_professor_id ORDER BY YearNum DESC,Semester,CourseCode
    ) AS result_row;
$function$;

-- 26. get_course_section_details
CREATE OR REPLACE FUNCTION get_course_section_details(p_course_id integer, p_term_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM CourseSectionDetails WHERE CourseID=p_course_id AND TermID=p_term_id ORDER BY SectionName,ProfessorName
    ) AS result_row;
$function$;

-- 27. get_course_instructor_history
CREATE OR REPLACE FUNCTION get_course_instructor_history(p_course_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM CourseInstructorHistory WHERE CourseID=p_course_id ORDER BY YearNum DESC, CASE Semester WHEN 'Fall' THEN 3 WHEN 'Summer' THEN 2 WHEN 'Spring' THEN 1 END DESC
    ) AS result_row;
$function$;

-- 28. get_observer_workload_for_cycle
CREATE OR REPLACE FUNCTION get_observer_workload_for_cycle(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT * FROM ObserverWorkload WHERE CycleID=p_cycle_id ORDER BY AssignedObservations DESC
    ) AS result_row;
$function$;

-- 29. get_observation_status_totals
CREATE OR REPLACE FUNCTION get_observation_status_totals(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT o.Status,COUNT(*) AS ObservationCount FROM Observation o JOIN ObservationSignup os ON os.SignupID=o.SignupID WHERE os.CycleID=p_cycle_id GROUP BY o.Status ORDER BY ObservationCount DESC
    ) AS result_row;
$function$;

-- 30. get_faculty_counts_by_level
CREATE OR REPLACE FUNCTION get_faculty_counts_by_level()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT CurrentLevel,COUNT(*) AS FacultyCount FROM Professors GROUP BY CurrentLevel ORDER BY CurrentLevel
    ) AS result_row;
$function$;

-- 31. get_faculty_due_counts_by_level
CREATE OR REPLACE FUNCTION get_faculty_due_counts_by_level(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT CurrentLevel,COUNT(*) AS FacultyDue FROM FacultyEvaluationDue WHERE CycleID=p_cycle_id AND IsDue=TRUE GROUP BY CurrentLevel ORDER BY CurrentLevel
    ) AS result_row;
$function$;

-- 32. get_faculty_due_for_cycle
CREATE OR REPLACE FUNCTION get_faculty_due_for_cycle(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT ProfessorID,ProfessorName,CurrentLevel,LastEvaluationYear,RequiredIntervalYears FROM FacultyEvaluationDue WHERE CycleID=p_cycle_id AND IsDue=TRUE ORDER BY CurrentLevel,ProfessorName
    ) AS result_row;
$function$;

-- 33. get_faculty_never_evaluated_for_cycle
CREATE OR REPLACE FUNCTION get_faculty_never_evaluated_for_cycle(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT ProfessorID,ProfessorName,CurrentLevel FROM FacultyEvaluationDue WHERE CycleID=p_cycle_id AND LastEvaluationYear IS NULL AND IsDue=TRUE
    ) AS result_row;
$function$;

-- 34. get_observer_enrollments_for_cycle
CREATE OR REPLACE FUNCTION get_observer_enrollments_for_cycle(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorID,p.ProfessorName,oe.EnrollmentDate,oe.Status FROM ObserverEnrollment oe JOIN Professors p ON p.ProfessorID=oe.ProfessorID WHERE oe.CycleID=p_cycle_id ORDER BY p.ProfessorName
    ) AS result_row;
$function$;

-- 35. diagnose_enrolled_observers_without_availability
CREATE OR REPLACE FUNCTION diagnose_enrolled_observers_without_availability()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorID,p.ProfessorName,oe.CycleID,oe.EnrollmentDate,oe.Status FROM ObserverEnrollment oe JOIN Professors p ON p.ProfessorID=oe.ProfessorID WHERE oe.Status='Active' AND NOT EXISTS (SELECT 1 FROM ObserverAvailability oa WHERE oa.ProfessorID=oe.ProfessorID AND oa.CycleID=oe.CycleID) ORDER BY p.ProfessorName
    ) AS result_row;
$function$;

-- 36. get_active_evaluation_criteria
CREATE OR REPLACE FUNCTION get_active_evaluation_criteria(p_template_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT ec.CriterionID,ec.CriterionName,ec.Description,ec.DisplayOrder,ecs.SectionName,ec.IsRequired FROM EvaluationCriterion ec LEFT JOIN EvaluationCriterionSection ecs ON ecs.SectionID=ec.SectionID WHERE ec.TemplateID=p_template_id AND ec.IsActive=TRUE ORDER BY ecs.DisplayOrder NULLS LAST,ec.DisplayOrder,ec.CriterionID
    ) AS result_row;
$function$;

-- 37. get_evaluation_cycle_config
CREATE OR REPLACE FUNCTION get_evaluation_cycle_config(p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT ec.CycleID,t.Semester,t.YearNum,ec.SignUpDeadLine,ec.ObservationDeadLine,ec.PostObservationFeedbackDeadLine,ec.AppFeedbackDeadLine,ot.TemplateID,ot.TemplateVersion,ot.IsLocked FROM EvaluationCycle ec JOIN AcademicTerm t ON t.TermID=ec.TermID LEFT JOIN ObservationTemplate ot ON ot.TemplateID=ec.TemplateID WHERE ec.CycleID=p_cycle_id
    ) AS result_row;
$function$;

-- 38. get_teacher_profile
CREATE OR REPLACE FUNCTION get_teacher_profile(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorID,p.ProfessorName,d.DepartmentName,p.CurrentLevel,CASE WHEN p.CurrentLevel='Assistant' THEN 'Annual' WHEN p.CurrentLevel IN ('Associate','Full') THEN 'Every 2 years' ELSE 'Not specified' END AS EvaluationFrequency,(SELECT COUNT(*) FROM Observation o WHERE o.ObserverProfessorID=p.ProfessorID AND o.Status='Completed') AS EvaluationsGiven,(SELECT MAX(o.CompletedDate) FROM Observation o WHERE o.ObserveeID=p.ProfessorID AND o.Status='Completed' AND o.CompletedDate IS NOT NULL) AS LastEvaluationDate FROM Professors p JOIN Department d ON d.DepartmentID=p.ProfessorDepartment WHERE p.ProfessorID=p_professor_id
    ) AS result_row;
$function$;

-- 39. get_teacher_upcoming_observations
CREATE OR REPLACE FUNCTION get_teacher_upcoming_observations(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT pod.ObservationID,pod.SignupID,pod.CycleID,CASE WHEN pod.ObserveeID=p_professor_id THEN 'Being observed' ELSE 'Observing' END AS EvaluationType,CASE WHEN pod.ObserveeID=p_professor_id THEN pod.ObserverName ELSE pod.ObserveeName END AS OtherProfessor,pod.CourseCode,pod.CourseName,pod.SectionName,pod.ScheduledDate,pod.ScheduledTime,pod.ObservationStatus,pod.ObservationDeadLine FROM ProfessorObservationDashboard pod WHERE (pod.ObserveeID=p_professor_id OR pod.ObserverProfessorID=p_professor_id) AND pod.ScheduledDate>=CURRENT_DATE AND pod.ObservationStatus IS DISTINCT FROM 'Completed' ORDER BY pod.ScheduledDate,pod.ScheduledTime
    ) AS result_row;
$function$;

-- 40. get_teacher_schedule_for_term
CREATE OR REPLACE FUNCTION get_teacher_schedule_for_term(p_professor_id integer, p_term_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT SectionID,SectionName,CourseCode,CourseName,MeetingDays,StartTime,EndTime FROM ProfessorCourseSchedule WHERE ProfessorID=p_professor_id AND TermID=p_term_id ORDER BY MeetingDays,StartTime
    ) AS result_row;
$function$;

-- 41. get_teacher_monthly_evaluation_count
CREATE OR REPLACE FUNCTION get_teacher_monthly_evaluation_count(p_professor_id integer, p_month date DEFAULT CURRENT_DATE)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT COUNT(*) AS EvaluationsThisMonth FROM Observation o WHERE (o.ObserveeID=p_professor_id OR o.ObserverProfessorID=p_professor_id) AND o.ScheduledDate>=DATE_TRUNC('month',p_month)::date AND o.ScheduledDate<(DATE_TRUNC('month',p_month)+INTERVAL '1 month')::date
    ) AS result_row;
$function$;

-- 42. get_teacher_evaluation_progress
CREATE OR REPLACE FUNCTION get_teacher_evaluation_progress(p_professor_id integer, p_cycle_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT fed.ProfessorID,fed.ProfessorName,fed.CurrentLevel,fed.CycleID,fed.EvaluationYear,fed.RequiredIntervalYears,fed.LastEvaluationYear,fed.IsDue,COUNT(DISTINCT o.ObservationID) FILTER (WHERE o.Status='Completed') AS EvaluationsReceived,ec.ObservationDeadLine FROM FacultyEvaluationDue fed JOIN EvaluationCycle ec ON ec.CycleID=fed.CycleID LEFT JOIN ObservationSignup os ON os.ObserveeProfessorID=fed.ProfessorID AND os.CycleID=fed.CycleID LEFT JOIN Observation o ON o.SignupID=os.SignupID AND o.ObserveeID=fed.ProfessorID WHERE fed.ProfessorID=p_professor_id AND fed.CycleID=p_cycle_id GROUP BY fed.ProfessorID,fed.ProfessorName,fed.CurrentLevel,fed.CycleID,fed.EvaluationYear,fed.RequiredIntervalYears,fed.LastEvaluationYear,fed.IsDue,ec.ObservationDeadLine
    ) AS result_row;
$function$;

-- 43. get_teacher_evaluation_history
CREATE OR REPLACE FUNCTION get_teacher_evaluation_history(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT o.ObservationID,o.CompletedDate AS EvaluationDate,CASE WHEN o.ObserveeID=p_professor_id THEN 'Observed' ELSE 'Observing' END AS EvaluationType,CASE WHEN o.ObserveeID=p_professor_id THEN observer.ProfessorName ELSE observee.ProfessorName END AS OtherProfessor,c.CourseCode,c.CourseName,o.Status,o.Notes FROM Observation o JOIN ObservationSignup os ON os.SignupID=o.SignupID JOIN Professors observee ON observee.ProfessorID=o.ObserveeID JOIN Professors observer ON observer.ProfessorID=o.ObserverProfessorID JOIN Sections s ON s.SectionID=os.SectionID JOIN Courses c ON c.CourseID=s.CourseID WHERE (o.ObserveeID=p_professor_id OR o.ObserverProfessorID=p_professor_id) AND o.Status='Completed' ORDER BY o.CompletedDate DESC,o.ObservationID DESC
    ) AS result_row;
$function$;

-- 44. get_teacher_eligible_observers
CREATE OR REPLACE FUNCTION get_teacher_eligible_observers(p_signup_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT e.ProfessorID,p.ProfessorName,p.CurrentLevel,d.DepartmentName FROM get_eligible_observers(p_signup_id) e JOIN Professors p ON p.ProfessorID=e.ProfessorID JOIN Department d ON d.DepartmentID=p.ProfessorDepartment ORDER BY p.ProfessorName
    ) AS result_row;
$function$;

-- 45. get_teacher_incoming_requests
CREATE OR REPLACE FUNCTION get_teacher_incoming_requests(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT RequestID,SignupID,ObserverProfessorID,ObserveeName,CourseCode,CourseName,SectionName,MeetingDays,StartTime,EndTime,RequestDate,ExpirationDate,ExpirationTime,RequestStatus FROM ProfessorObserverInvitations WHERE ObserverProfessorID=p_professor_id ORDER BY CASE WHEN RequestStatus='Pending' THEN 0 ELSE 1 END,ExpirationDate,ExpirationTime
    ) AS result_row;
$function$;

-- 46. get_teacher_settings_profile
CREATE OR REPLACE FUNCTION get_teacher_settings_profile(p_professor_id integer)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT to_jsonb(result_row)
    FROM (
        SELECT p.ProfessorID,p.ProfessorName,p.CurrentLevel,d.DepartmentName FROM Professors p JOIN Department d ON d.DepartmentID=p.ProfessorDepartment WHERE p.ProfessorID=p_professor_id
    ) AS result_row;
$function$;

