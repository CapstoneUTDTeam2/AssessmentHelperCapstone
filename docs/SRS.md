# Software Requirements Specification

## 1. Introduction

### 1.1 Purpose

### 1.2 Scope

- Manage faculty profiles
- Retrieve course and teaching history
- Determine which faculty members are due for evaluation
- Faculty member observation matching based on course level and experience
- Customizeable assessment and observation workflows
- Track participation of both parties, including a sign-off
- Retrievability of the documented observation
- Provide dashboards, reports, KPI metrics for the evaluation process
- Lousely coupled integration with public API's

### 1.3 Definitions and References

[Teacher Q&A](Q_A.docx)
## 2. Overall Description

### 2.1 Product Perspective
**External View:**

The assessment helper aims to provide a more seamless evaluation experience for university professors by providing a web app for professors to use. For each eval cycle, this tools allows the observed, observee, and assessment committee(AC) to coordinate for the goal of reviewing, affirming, and/or improving the current teaching atmosphere. 

The current systems aims not to replace the AC members duties, but provide an easier experience through customizable observer matching, eval cycle tracking, and analytics review. The three primary user groups this platform aims to support are the faculty member being observed, the faculty member that is observing them, and the AC members

### 2.2 Product Functions

### 2.3 User Classes and Characteristics

### 2.4 Operating Environment

The operating environment for this platform is web based using a client-server architecture. The platform will be available most devices with internet connections. Users will interact with the React-based frontend. All authentication and any secure operations will be communicated to and completed in the backend using FastAPI and Python. When the backend needs data, it will communicate to the database using PostgresSQL.


### 2.5 Constraints

### 2.6 Assumptions and Dependencies

## 3. External Interface Requirements

### 3.1 User Interfaces

- Login
- Dashboard
- Faculty profile
- Evaluation page
- Observer matching
- Observation history
- Observation signup
  

### 3.2 Software Interfaces

`POST /api/match-observers`

Request: faculty_id, course_id, requested_day, requested_time
Response: list of up to 5 observers, each with observer_id, name, and department


### 3.3 Communication Interfaces

- Sign-up form: web form with Single Sign-On
- Observation confirmation: submitted by the observee through a web form with Single Sign-On
- Observation form: docx file, filled out by the observer during the observation
- Process feedback form: web form with Single Sign-On


## 4. System Features

### 4.1 User and Role Management

- Two user personas: Faculty and Assessment Committee members
- Students don’t have access to the system
- Faculty can look at their own profile, evaluation status, and observation history
- Assessment Committee members can look at faculty due and overdue for evaluation, manage observer matching, send reminder notifications, and modify the observation template, criteria, and ratings

### 4.2 Data Management

- All data is stored in a PostgreSQL database running in Docker
- Database credentials and the Nebula Labs API key are kept in a .env file and not committed to GitHub for safety
- Observations are kept permanently and never deleted
- The database is backed up daily
- Each observation is linked to the observee, observer, course section, eval cycle, and template version used
- Only one observation is allowed per course/section
- An observation is locked once both the observer and observee sign it
- The observee's explanation is stored separately so it can be added after the observation is locked
- Ratings must match the active rating scale or Not Applicable
- Changing the criteria creates a new template version and old versions are kept
- Records store when they were created and last updated
- Changes to templates, criteria, and faculty profiles record which AC member made them
- Faculty profile data is managed by the AC and cannot be edited by faculty
- Course and professor data is pulled from the Nebula Labs API at the start of each semester
- Professor names are anonymized when data is pulled in
- Pre-observation notes and student accommodation info are not stored
  
### 4.3 Workflow and Scheduling

- Assistant professors are evaluated every year, once in Spring and once in Fall
- Associate and full professors are evaluated every 2 years
- Frequency is configurable per professor to handle promotions or role changes
- First semester professors are not evaluated
- No evaluations are scheduled during summer
- Faculty selects a course/section to be observed for
- The system generates a list of eligible observers
- Faculty coordinates and confirms a date with a selected observer
- Observer completes the observation form during the session
- Observee confirms the observation occurred through the system


### 4.4 Matching and Recommendations

- Courses are categorized by level using the most significant digit (1000, 2000, 3000, 4000)
- An eligible observer must be in the same department as the observee and teach at that same course level
- An eligible observer must be free during the requested observation day and time
- The observee is excluded from their own match list
- The system returns up to 5 matching observers; if more than 5 qualify, 5 are selected at random
- If no eligible observer can be found, the Assessment Committee dashboard shows an alert immediately


### 4.5 Dashboard and Reporting

### 4.6 Notifications and Integrations

- Notifications are sent by email and in app
- Faculty are notified when they are due for evaluation
- Observers are notified when a faculty member requests them
- Faculty are notified when their observation is scheduled
- Faculty are notified when the observation report is ready to sign
- AC members can notify observees when their observer list is ready
- AC members can send reminder emails to overdue faculty
- AC members send out the sign-up, observation, and feedback deadlines for each eval cycle
- AC members can turn each alert type on or off in settings
- The Nebula Labs API provides course, section, professor, and term data
- API data is anonymized, saved to CSV files, and loaded into PostgreSQL
- The sign-up, observation confirmation, and process feedback forms use Single Sign-On
- The email service must be free, run on a VM, and not be a trial version
- Calendar integration is a stretch goal and not part of the MVP
- If a Nebula Labs API pull fails, existing data is kept and the AC is alerted

## 5. Nonfunctional Requirements

### 5.1 Performance

### 5.2 Security and Privacy
- Authenticate faculty members before accessing data
- Only the evaluated member, the observer, and Assessment Committee members can see the assessments
- Keep names and identities fake
  
  
### 5.3 Reliability

### 5.4 Usability

### 5.5 Scalability and Maintainability

### 5.6 Business Rules

## 6. Other Requirements

### 6.1 Data Requirements

- The system supports around 100 faculty members and dozens of courses per semester
- Department, term, professor, course, section, and teaching assignment data comes from the Nebula Labs API
- Eval cycles, deadlines, faculty levels, eval frequency, criteria, weights, and rating scales are set by the AC
- Observation sign-ups, observer requests, survey responses, and observee explanations are submitted by faculty
- Ratings, notes, summaries, and signatures are submitted by the observer
- Course level is determined by the most significant digit of the course number
- Each professor's start term is stored to identify first semester professors
- The observer lists generated by the system are stored for KPI calculations
- KPIs require eval due dates, completion status, last eval date, hiring level, sign-ups, observation assignments, and observer availability
- Test data uses courses from the UTD CourseBook and placeholder data from the DML script

### 6.2 KPIs and Metrics

#### Faculty Evaluation KPI

**Two Components** 
##### a.Evaluation Eligibility Accuracy
- not the same prof
- not the same level prof from another department
- not a different level prof from any department
- not a same level prof in same department but works during requested class times

**Formula**
Eligibility Accuracy = Correct matches / Total matches Generated 

Should be shown as percentage on dashboard so AC and other admins can reflect and analyze accordingly

##### b. Overdue Evaluation Count
**Assistants profs:** once every calendar year
**Associate/Full profs:** Once every 2 calendar years

Profs are put in the evaluation cycle in the same semester type as the previous evaluation cycle, ie. Assistant prof eval done in spring 2026, so spring 2027 they are due for eval. In Fall 2027 they are overdue


**Formula**
Overdue Eval Count = Number of profs due for eval in previous semester who did not complete the process.

Shown as number to show how many professors are behind, or to see if there is issue. Can retrieve more information to see which of these are currently signed in the evaluation cycle. Can also show amount of completed evaluations to get a reference of how successful participation is. 



#### Assessment Participation KPI

**Two Components**

###### a. Assessment Participation Rate
How many profs who were due for an evaluation signed up for the current eval cycle. 

**Formula**
Assessment Participation Rate = Number of profs who signed up/ Number of total profs due for an eval

Should show on AC/admin dashboard to see current participation rate. Can detect whether marketing, notifying methods are working

###### b. Observer Utilization rate
Shows how effectively the observer pool is being used 

**Formula**
Observer Utilizatoin arte = Number of profs who served as an observer/ Number of profs currently signed up

Shoown as percentage in AC/admin dashboard. Can analyze observer participation and matching process


### 6.3 Testing and Acceptance Criteria

### 6.4 Open Questions and TODOs

## Appendix A: Glossary

## Appendix B: Diagrams and Models
