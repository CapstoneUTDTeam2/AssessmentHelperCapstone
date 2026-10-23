// Placeholder data for the faculty (teacher) dashboard, shown to the demo
// faculty account. Swap these for API responses once the backend is wired up.

/** Fixed "today" so the mock schedule lines up with the design. */
export const TEACHER_TODAY = '2026-10-20'

export const TEACHER_PROFILE = {
  name: 'Professor A',
  department: 'Computer Science · Erik Jonsson School',
  rank: 'Associate Professor',
  track: 'Tenure-track',
  evaluationCycle: 'Every 2 years',
  nextEvaluation: 'Spring 2027',
  evaluationsGiven: '4 this year',
  instructorLevels: ['4000s'],
}

export type UpcomingKind = 'Being observed' | 'Observing'

export interface UpcomingEvaluation {
  id: number
  /** ISO date. */
  date: string
  kind: UpcomingKind
  /** The other professor: the observer, or the person being observed. */
  otherProfessor: string
  course: string
  section: string
  /** "HH:MM" 24-hour. */
  start: string
  end: string
  room: string | null
  confirmed: boolean
  /** ISO date the observer's report is due, once the session is past or near. */
  reportDue?: string
}

export const UPCOMING: UpcomingEvaluation[] = [
  { id: 1, date: '2026-09-16', kind: 'Being observed', otherProfessor: 'Professor I', course: 'CS 3345 Data Structures', section: '001', start: '10:00', end: '11:15', room: 'ECSS 2.410', confirmed: true },
  { id: 2, date: '2026-09-24', kind: 'Observing', otherProfessor: 'Professor C', course: 'CS 2305 Discrete Math', section: '002', start: '10:00', end: '11:15', room: 'ECSS 2.311', confirmed: true },
  { id: 3, date: '2026-10-14', kind: 'Observing', otherProfessor: 'Professor H', course: 'CS 1336 Programming Fundamentals', section: '002', start: '09:00', end: '09:50', room: 'ECSS 2.415', confirmed: true, reportDue: '2026-10-21' },
  { id: 4, date: '2026-10-28', kind: 'Being observed', otherProfessor: 'Professor F', course: 'CS 4348 Operating Systems', section: '001', start: '14:30', end: '15:45', room: 'ECSS 2.306', confirmed: false },
]

export type ReportRating = '5' | '4' | '3' | '2' | '1' | 'N/A'

/** A colleague's submitted report on one of your classes, waiting for you to review and sign. */
export interface ReceivedReport {
  /** ISO date the observer signed. */
  observerSignedOn: string
  /** Rating per criterion id. */
  ratings: Record<number, ReportRating>
  strengths: string
  growth: string
}

/** Reports on your classes, keyed by the "Being observed" session id in UPCOMING. */
export const RECEIVED_REPORTS: Record<number, ReceivedReport> = {
  1: {
    observerSignedOn: '2026-09-21',
    ratings: { 1: '4', 2: 'N/A', 5: '4', 6: '3', 7: '5', 8: '4', 9: '5', 10: '5', 11: '4' },
    strengths:
      'Clear explanations of tree rotations with well-chosen examples. Questions were answered patiently and tied back to earlier material.',
    growth: 'Build in a short pair activity mid-lecture so more students get a chance to work through an example themselves.',
  },
}

export type Weekday ='Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'

export interface WeeklyBlock {
  /** Course number, e.g. "CS 3345"; omitted for office hours. */
  course: string | null
  /** Full course name, used to match observations to this class. */
  courseName: string | null
  days: Weekday[]
  start: string
  end: string
  room: string | null
}

/** Professor A's recurring Fall 2026 schedule: 4 sections plus office hours. */
export const WEEKLY_SCHEDULE: WeeklyBlock[] = [
  { course: 'CS 3345', courseName: 'CS 3345 Data Structures', days: ['Mon', 'Wed'], start: '10:00', end: '11:15', room: 'ECSS 2.410' },
  { course: 'CS 3345', courseName: 'CS 3345 Data Structures', days: ['Mon', 'Wed'], start: '13:00', end: '14:15', room: 'ECSS 2.410' },
  { course: 'CS 2336', courseName: 'CS 2336 Object-Oriented Programming', days: ['Tue', 'Thu'], start: '13:00', end: '14:15', room: 'ECSN 2.120' },
  { course: 'CS 4348', courseName: 'CS 4348 Operating Systems', days: ['Mon', 'Wed'], start: '14:30', end: '15:45', room: 'ECSS 2.306' },
  { course: null, courseName: null, days: ['Tue'], start: '09:00', end: '10:00', room: null },
  { course: null, courseName: null, days: ['Fri'], start: '11:00', end: '12:00', room: null },
]

/** Contact and appointment details shown on the My Profile page. */
export const PROFILE_DETAILS = {
  contact: [
    ['Office', 'ECSS 4.702'],
    ['Office hours', 'Tue 9–10 AM · Fri 11 AM–12 PM'],
    ['Department', 'Computer Science'],
    ['Instructor level', '4000s'],
  ],
  appointment: [
    ['Hire level', 'Associate Professor'],
    ['Start term', 'Fall 2019'],
    ['Tenure status', 'Tenured (May 2025)'],
    ['Evaluation cycle', 'Every 2 years'],
    ['Last evaluation', 'Mar 12, 2025 · Meets expectations'],
    ['Next evaluation', 'Spring 2027 · due Mar 2027'],
    ['Observations this cycle', '1 received'],
    ['Can be observed by', 'Associate or Full Professors'],
    ['Can observe', 'Assistant Professors, Lecturers'],
  ],
} satisfies Record<string, [string, string][]>

export interface CurrentCourse {
  course: string
  title: string
  section: string
  days: string
  start: string
  end: string
  room: string
  enrolled: number
  capacity: number
}

/** Fall 2026 sections, as pulled from UTD CourseBook. */
export const CURRENT_COURSES: CurrentCourse[] = [
  { course: 'CS 3345', title: 'Data Structures & Algorithm Analysis', section: '001', days: 'MW', start: '10:00', end: '11:15', room: 'ECSS 2.410', enrolled: 118, capacity: 120 },
  { course: 'CS 3345', title: 'Data Structures & Algorithm Analysis', section: '002', days: 'MW', start: '13:00', end: '14:15', room: 'ECSS 2.410', enrolled: 104, capacity: 120 },
  { course: 'CS 2336', title: 'Object-Oriented Programming', section: '003', days: 'TR', start: '13:00', end: '14:15', room: 'ECSN 2.120', enrolled: 96, capacity: 100 },
  { course: 'CS 4348', title: 'Operating Systems Concepts', section: '001', days: 'MW', start: '14:30', end: '15:45', room: 'ECSS 2.306', enrolled: 94, capacity: 100 },
]

export interface TeachingTerm {
  semester: string
  /** Sortable key, e.g. "2026-1" for Spring 2026, "2025-3" for Fall 2025. */
  order: string
  courses: string[]
  sections: number
}

export const TEACHING_HISTORY: TeachingTerm[] = [
  { semester: 'Spring 2026', order: '2026-1', courses: ['CS 3345', 'CS 2336'], sections: 3 },
  { semester: 'Fall 2025', order: '2025-3', courses: ['CS 3345', 'CS 4348'], sections: 3 },
  { semester: 'Spring 2025', order: '2025-1', courses: ['CS 2336', 'CS 4348'], sections: 2 },
  { semester: 'Fall 2024', order: '2024-3', courses: ['CS 3345', 'CS 2336'], sections: 3 },
  { semester: 'Spring 2024', order: '2024-1', courses: ['CS 4348'], sections: 2 },
  { semester: 'Fall 2023', order: '2023-3', courses: ['CS 3345', 'CS 1337'], sections: 3 },
]

export type EvaluationOutcome = 'Exceeds expectations' | 'Meets expectations' | 'Needs improvement'

export interface PastEvaluation {
  /** ISO year-month. */
  date: string
  observer: string
  course: string
  outcome: EvaluationOutcome
}

export const EVALUATION_HISTORY: PastEvaluation[] = [
  { date: '2025-03', observer: 'Professor F', course: 'CS 3345', outcome: 'Meets expectations' },
  { date: '2023-03', observer: 'Professor I', course: 'CS 2336', outcome: 'Meets expectations' },
  { date: '2021-03', observer: 'Professor D', course: 'CS 3345', outcome: 'Exceeds expectations' },
]

/**
 * This faculty member's evaluation cycle. Rank sets how often an evaluation is
 * due (Assistant: every year, Associate/Full: every 2 years). How many
 * observations one evaluation needs is not confirmed with the client, so we
 * only count observations received and don't show a required number.
 */
export const EVALUATION_REQUIREMENT = {
  /** Peer observations received since the last formal evaluation. */
  observationsReceived: 1,
  frequency: 'Every 2 years',
  nextDue: 'Mar 2027',
  /** ISO year-month of the next formal evaluation. */
  nextDueMonth: '2027-03',
  cycle: '2-year cycle',
}

export interface OpenSignup {
  id: number
  name: string
  email: string
  course: string
  section: string
  days: string
  /** "HH:MM" 24-hour. */
  start: string
  end: string
}

/** Colleagues signed up to be observed this cycle who still need an observer. */
export const OPEN_SIGNUPS: OpenSignup[] = [
  { id: 1, name: 'Professor B', email: 'profb@example.edu', course: 'CS 4337', section: '001', days: 'Mon / Wed', start: '13:00', end: '14:15' },
  { id: 2, name: 'Professor D', email: 'profd@example.edu', course: 'CS 3341', section: '002', days: 'Tue / Thu', start: '11:30', end: '12:45' },
  { id: 3, name: 'Professor E', email: 'profe@example.edu', course: 'CS 2336', section: '501', days: 'Fri', start: '09:00', end: '11:45' },
]

export type HistoryType = 'Observing' | 'Observed' | 'Evaluation'

export interface HistoryEntry {
  id: number
  /** ISO date. */
  date: string
  type: HistoryType
  /** Who and what, e.g. "Professor G · CS 1337-002". */
  withCourse: string
  outcome: string | null
  status: 'Report submitted' | 'Report received' | 'Closed'
}

export const EVALUATION_LOG: HistoryEntry[] = [
  { id: 1, date: '2026-02-19', type: 'Observing', withCourse: 'Professor G · CS 1337-002', outcome: null, status: 'Report submitted' },
  { id: 2, date: '2025-10-08', type: 'Observed', withCourse: 'Professor F · CS 3345-002', outcome: 'Effective', status: 'Report received' },
  { id: 3, date: '2025-04-22', type: 'Observing', withCourse: 'Professor L · CS 2305-001', outcome: null, status: 'Report submitted' },
  { id: 4, date: '2025-03-12', type: 'Evaluation', withCourse: 'Evaluation Committee · Formal evaluation', outcome: 'Meets expectations', status: 'Closed' },
  { id: 5, date: '2024-11-05', type: 'Observed', withCourse: 'Professor I · CS 4348-001', outcome: 'Effective', status: 'Report received' },
]
