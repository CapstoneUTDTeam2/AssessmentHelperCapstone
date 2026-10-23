# READ BEFORE CHANGE

Read this file before changing frontend, backend, database, or process behavior.

This is the product process for Assessment Helper. If something is not written here, it is unknown: do not invent a rule, do not copy a conflicting mock, and say so.

The original PDF is `docs/READ-BEFORE-CHANGE.pdf` (same content; the PDF is not reliably machine-readable).

---

## Evaluation Cycle

**Assistant Profs:** Once in every calendar year

- Prof A’s last evaluation was in Spring 2025 means that in Spring 2026 or Fall 2026 they need to be evaluated again

**Associate / Full Profs:** Once every 2 calendar years

- If Prof A's last observation was in Spring 2025, then Prof A's name should come
  - in Spring 2027 as they are due in that semester
  - from Fall 2027, it should appear in the Over-due list.

---

## Assessment Committee (AC)

They are the Professors who facilitate evaluations by kicking off the process every semester. They should:

- have the ability to change the template, criteria & its ratings.
- have the ability to see the list of Professors who are due & over-due this semester.
- Should be able to send notification/email reminding the above Profs about
  - whether they are due or over-due
  - signup deadline: the date by which everyone who is due/over-due should sign up.
  - observation-period deadline: the date by which observations should be completed.
  - feedback/survey deadline: the date by which all Observees should have taken the feedback/survey
- Should be able to see all the signup requests
  - which should have Course #, Section#, Meeting days & time, Observee Name, Observee email ID.
- After signup deadline is over, AC should be able to click a button to do Observer Selection.
  - System should show each Observee signup and the corresponding list of 5 Observers and a Button to send notifications to each Observee that their list is ready.
  - System should show the ALERT for Observees with NO / insufficient Observers.
- AC should complete the Observer selection process manually - stretch goal.
- After observation-period deadline is over, AC should be able to send notification to all Observees requesting them to take part in the end-of-process survey.
- After feedback deadline is over, the system should generate the KPIs and AC should be able to see those KPIs (see the KPIs listed at the end).

---

## Observee

A Professor signing up for this cycle to be observed.

As an Observee, I should be able to see:

- The semester that I am due for observation
  - IF Prof A's last observation was Spring 2025, the System should show Spring 2027.
- Observations
  - that somebody gave me in the past semesters
  - that somebody would give me this semester
- When I sign up for a cycle:
  - all the classes that I teach in that semester along with days & times
- For now, we can assume that each Observee will sign up to be observed for just 1 course.
- Once the Signup deadline ends:
  - I should receive a notification from AC that I can start selecting my Observers.
  - For my selected course:
    - the System should show, the list of 5 possible Observers
    - the functionality to choose all or a subset of people from this list to send a request (that request should show my selected days/times and these dates should be before the observation-period deadline).
    - IF a request is confirmed by 1 or more Observers, then
      - the System should give me the ability to accept one of them AND send graceful declines to others.
      - the system should remember my choice of confirmed Observer.
- Once an Observation happens → It means that
  - An Observer has come in-person to observe me.
  - They have a copy of the observation template
  - Based on what they observe, they make notes on various criteria.
  - I have to sign it
  - The Observer also signs it
- Our signatures indicate that an Observation actually happened, irrespective of whether I agree with the ratings that the Observer gave.
- IF, by any chance, the observation could not be done within that cycle, I, as the Observee, should have the ability to update the System.
- Once the Observation period ends:
  - the System should show me survey/feedback about the process
    - Was this process ok or not
    - a place to list my difficulties
    - place to add my opinion on how to improve the process
  - the System should let me, as an Observee, upload a file to shed light on any trouble during the observation

---

## Observer

If a Prof signs up for a cycle to be Observed, they should be automatically put in the Observer Pool.

- Once the Signup deadline ends:
  - I should be able to see all observation requests
    - with Other Observees' selected days/times.
    - Able to confirm 1 or 2 or 3 observation requests.
    - Able to see all the accepted confirmations.
- Once an Observation happens:
  - the System should let me upload the signed observation
- Once the Observation period ends:
  - the System should show me survey/feedback about the process
    - was this process ok or not
    - a place to list my difficulties
    - place to add my opinion on how to improve the process

---

## Eligibility

1. 1000-level Prof of department ABC can only observe another 1000-level Prof in same department; similar requirement for all level courses
2. If Prof A from the ABC dept is requesting for 1000-level course on MW 8:30 am, then
   1. system should show 5 Profs who are free at that time AND who teach 1000-level courses in the same department
   2. system should not show Prof A as a potential Observer for Prof A themself.
   3. ALERT in AC Dashboard immediately IF no Observer can be found for a signup

---

## KPIs

1. Faculty evaluation KPI:
   1. Evaluation Eligibility Accuracy: Examples of Incorrect occurrences:
      1. not the same Prof
      2. not a same-level Prof from another dept
      3. not a different-level Prof from same dept or any dept
      4. not a same-level Prof from same dept but who works during the requested days/times
   2. Overdue Evaluation Count: Look at specs in the Evaluation Cycle
2. Assessment participation KPI:
   1. Assessment Participation Rate: # of Profs who signed up for this cycle / # of Profs who were due
   2. Observer Utilization Rate: # of Profs who took on the role of Observer / # of Profs who signed up for this cycle
3. Recommendation Engine KPI:
   1. List sufficiency rate: Average # of observer matches / # of sign-ups
4. Survey & Observation Completion KPI:
   1. Missing Observation Count: # of approved observation appointments that did not go through for some reason. Pair-confirmation should help determine this portion
   2. Survey Completion Rate: # of Profs who went through the entire process this semester.
      - Process means Sign up AND Sent request(s) AND Had 1 request confirmed AND Was observed AND took part in the final survey i.e. # of submitted surveys / # of sign ups

## Executive Dashboard Metrics (for AC members)

- Faculty due for evaluation – breakdown based on hire-level
- Outstanding Observation Report - breakdown based on hire-level
- Unmatched faculty report
