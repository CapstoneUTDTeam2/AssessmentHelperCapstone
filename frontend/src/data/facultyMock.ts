// Placeholder data for the Faculty Overview page. Swap these for API
// responses once the backend endpoints are wired up.

export type FacultyLevel = 'Assistant Prof.' | 'Associate Prof.' | 'Full Prof.' | 'Lecturer'

export type StatusTone = 'due' | 'overdue' | 'ok' | 'unknown'

export type EventKind = 'Observed' | 'Observing' | 'Evaluation'

export interface EvaluationEvent {
  date: string
  title: string
  subtitle: string
  kind: EventKind
}

export interface ObserverMatch {
  name: string
  rank: string
  detail: string
  courseLevel: string
}

export interface FacultyDetails {
  past: EvaluationEvent[]
  upcoming: EvaluationEvent[]
  hireLevel: string
  cycle: string
  lastEvaluation: string
  nextEvaluation: string
  instructorLevels: string[]
  canObserveThem: ObserverMatch[]
  theyCanObserve: ObserverMatch[]
}

export interface FacultyMember {
  id: number
  name: string
  email: string
  level: FacultyLevel
  courses: string[]
  completed: number
  required: number
  status: string
  statusTone: StatusTone
  /** ISO date of the next evaluation, used for sorting. */
  nextEvaluationDate: string
  dueThisCycle: boolean
  unmatched: boolean
  needsObserver: boolean
  details: FacultyDetails
}

export const TOTAL_FACULTY = 64

export const FACULTY: FacultyMember[] = [
  {
    id: 1,
    name: 'Professor A',
    email: 'professor.a@utdallas.edu',
    level: 'Associate Prof.',
    courses: ['CS 3345', 'CS 2336', 'CS 4348'],
    completed: 2,
    required: 3,
    status: 'Due Spring 2027',
    statusTone: 'due',
    nextEvaluationDate: '2027-03-01',
    dueThisCycle: true,
    unmatched: false,
    needsObserver: false,
    details: {
      past: [
        { date: 'Nov 05, 2024', title: 'Observed by Professor I · CS 4348', subtitle: 'Report submitted', kind: 'Observed' },
        { date: 'Mar 12, 2025', title: 'Formal evaluation', subtitle: 'Completed · Meets expectations', kind: 'Evaluation' },
        { date: 'Apr 22, 2025', title: 'Observing Professor L · CS 2305', subtitle: 'Report submitted', kind: 'Observing' },
        { date: 'Oct 08, 2025', title: 'Observed by Professor F · CS 3345', subtitle: 'Report submitted', kind: 'Observed' },
        { date: 'Feb 19, 2026', title: 'Observing Professor G · CS 1337', subtitle: 'Report submitted', kind: 'Observing' },
      ],
      upcoming: [
        { date: 'Sep 16, 2026', title: 'Observed by Professor I · CS 3345', subtitle: 'Confirmed', kind: 'Observed' },
        { date: 'Sep 24, 2026', title: 'Observing Professor C · CS 2305', subtitle: 'Confirmed', kind: 'Observing' },
        { date: 'Oct 14, 2026', title: 'Observed by Professor F · CS 4348', subtitle: 'Awaiting confirmation', kind: 'Observed' },
        { date: 'Spring 2027', title: 'Formal evaluation', subtitle: 'Scheduled', kind: 'Evaluation' },
      ],
      hireLevel: 'Associate Professor',
      cycle: 'Every 2 years (associate rule)',
      lastEvaluation: 'Mar 12, 2025',
      nextEvaluation: 'Spring 2027 · due Mar 2027',
      instructorLevels: ['4000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor I', rank: 'Full', detail: '6000s · CS 4348, CS 4375', courseLevel: '6000s' },
        { name: 'Professor F', rank: 'Associate', detail: '5000s · CS 3345, CS 5343', courseLevel: '5000s' },
        { name: 'Professor D', rank: 'Full', detail: '6000s · CS 6375, CS 4375', courseLevel: '6000s' },
      ],
      theyCanObserve: [
        { name: 'Professor G', rank: 'Assistant', detail: 'Overdue · 1000s · CS 1337', courseLevel: '1000s' },
        { name: 'Professor H', rank: 'Assistant', detail: 'Due this semester · 3000s', courseLevel: '3000s' },
      ],
    },
  },
  {
    id: 2,
    name: 'Professor G',
    email: 'professor.g@utdallas.edu',
    level: 'Assistant Prof.',
    courses: ['CS 1336', 'CS 1337'],
    completed: 0,
    required: 2,
    status: 'Overdue',
    statusTone: 'overdue',
    nextEvaluationDate: '2026-09-14',
    dueThisCycle: true,
    unmatched: false,
    needsObserver: false,
    details: {
      past: [
        { date: 'Feb 19, 2026', title: 'Observed by Professor A · CS 1337', subtitle: 'Report submitted', kind: 'Observed' },
      ],
      upcoming: [
        { date: 'Sep 14, 2026', title: 'Observed by Professor I · CS 1337', subtitle: 'Report overdue', kind: 'Observed' },
        { date: 'Fall 2026', title: 'Formal evaluation', subtitle: 'Overdue', kind: 'Evaluation' },
      ],
      hireLevel: 'Assistant Professor',
      cycle: 'Every year (assistant rule)',
      lastEvaluation: 'Sep 10, 2025',
      nextEvaluation: 'Fall 2026 · overdue',
      instructorLevels: ['1000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor A', rank: 'Associate', detail: '4000s · CS 3345, CS 4348', courseLevel: '4000s' },
        { name: 'Professor I', rank: 'Full', detail: '6000s · CS 4348, CS 4375', courseLevel: '6000s' },
      ],
      theyCanObserve: [],
    },
  },
  {
    id: 3,
    name: 'Professor D',
    email: 'professor.d@utdallas.edu',
    level: 'Full Prof.',
    courses: ['CS 6375', 'CS 4375'],
    completed: 3,
    required: 3,
    status: 'Up to date',
    statusTone: 'ok',
    nextEvaluationDate: '2029-03-01',
    dueThisCycle: true,
    unmatched: false,
    needsObserver: false,
    details: {
      past: [
        { date: 'Oct 02, 2025', title: 'Observing Professor H · CS 3305', subtitle: 'Report submitted', kind: 'Observing' },
        { date: 'Jan 28, 2026', title: 'Observed by Professor I · CS 6375', subtitle: 'Report submitted', kind: 'Observed' },
        { date: 'Apr 15, 2026', title: 'Formal evaluation', subtitle: 'Completed · Exceeds expectations', kind: 'Evaluation' },
      ],
      upcoming: [],
      hireLevel: 'Full Professor',
      cycle: 'Every 2 years (full rule)',
      lastEvaluation: 'Apr 15, 2026',
      nextEvaluation: 'Spring 2028',
      instructorLevels: ['6000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor I', rank: 'Full', detail: '6000s · CS 4348, CS 4375', courseLevel: '6000s' },
      ],
      theyCanObserve: [
        { name: 'Professor A', rank: 'Associate', detail: 'Due Spring 2027 · 4000s', courseLevel: '4000s' },
        { name: 'Professor H', rank: 'Assistant', detail: 'Due this semester · 3000s', courseLevel: '3000s' },
      ],
    },
  },
  {
    id: 4,
    name: 'Professor H',
    email: 'professor.h@utdallas.edu',
    level: 'Assistant Prof.',
    courses: ['CS 1336', 'CS 3305'],
    completed: 1,
    required: 2,
    status: 'Due this semester',
    statusTone: 'due',
    nextEvaluationDate: '2026-10-21',
    dueThisCycle: true,
    unmatched: false,
    needsObserver: true,
    details: {
      past: [
        { date: 'Oct 02, 2025', title: 'Observed by Professor D · CS 3305', subtitle: 'Report submitted', kind: 'Observed' },
      ],
      upcoming: [
        { date: 'Oct 14, 2026', title: 'Observed by Professor A · CS 1336', subtitle: 'Awaiting confirmation', kind: 'Observed' },
        { date: 'Dec 2026', title: 'Formal evaluation', subtitle: 'Scheduled', kind: 'Evaluation' },
      ],
      hireLevel: 'Assistant Professor',
      cycle: 'Every year (assistant rule)',
      lastEvaluation: 'Dec 04, 2025',
      nextEvaluation: 'Fall 2026 · due Dec 2026',
      instructorLevels: ['3000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor A', rank: 'Associate', detail: '4000s · CS 3345, CS 4348', courseLevel: '4000s' },
        { name: 'Professor D', rank: 'Full', detail: '6000s · CS 6375, CS 4375', courseLevel: '6000s' },
      ],
      theyCanObserve: [],
    },
  },
  {
    id: 5,
    name: 'Professor L',
    email: 'professor.l@utdallas.edu',
    level: 'Lecturer',
    courses: ['CS 2305'],
    completed: 0,
    required: 1,
    status: 'Due this semester',
    statusTone: 'due',
    nextEvaluationDate: '2026-09-28',
    dueThisCycle: true,
    unmatched: true,
    needsObserver: true,
    details: {
      past: [
        { date: 'Apr 22, 2025', title: 'Observed by Professor A · CS 2305', subtitle: 'Report submitted', kind: 'Observed' },
      ],
      upcoming: [
        { date: 'Sep 28, 2026', title: 'Observation · CS 2305', subtitle: 'No observer assigned', kind: 'Observed' },
      ],
      hireLevel: 'Lecturer',
      cycle: 'Every year (lecturer rule)',
      lastEvaluation: 'Apr 22, 2025',
      nextEvaluation: 'Fall 2026 · due Sep 2026',
      instructorLevels: ['2000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor A', rank: 'Associate', detail: '4000s · CS 3345, CS 4348', courseLevel: '4000s' },
        { name: 'Professor F', rank: 'Associate', detail: '5000s · CS 3345, CS 5343', courseLevel: '5000s' },
      ],
      theyCanObserve: [],
    },
  },
  {
    id: 6,
    name: 'Professor C',
    email: 'professor.c@utdallas.edu',
    level: 'Assistant Prof.',
    courses: ['CS 2305', 'CS 2340'],
    completed: 1,
    required: 2,
    status: 'Due this semester',
    statusTone: 'due',
    nextEvaluationDate: '2026-10-01',
    dueThisCycle: true,
    unmatched: false,
    needsObserver: false,
    details: {
      past: [
        { date: 'Nov 12, 2025', title: 'Observed by Professor F · CS 2340', subtitle: 'Report submitted', kind: 'Observed' },
      ],
      upcoming: [
        { date: 'Sep 24, 2026', title: 'Observed by Professor A · CS 2305', subtitle: 'Confirmed', kind: 'Observed' },
      ],
      hireLevel: 'Assistant Professor',
      cycle: 'Every year (assistant rule)',
      lastEvaluation: 'Dec 01, 2025',
      nextEvaluation: 'Fall 2026 · due Oct 2026',
      instructorLevels: ['2000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor A', rank: 'Associate', detail: '4000s · CS 3345, CS 4348', courseLevel: '4000s' },
      ],
      theyCanObserve: [],
    },
  },
  {
    id: 7,
    name: 'Professor F',
    email: 'professor.f@utdallas.edu',
    level: 'Associate Prof.',
    courses: ['CS 3345', 'CS 5343'],
    completed: 3,
    required: 3,
    status: 'Up to date',
    statusTone: 'ok',
    nextEvaluationDate: '2027-11-01',
    dueThisCycle: false,
    unmatched: false,
    needsObserver: false,
    details: {
      past: [
        { date: 'Oct 08, 2025', title: 'Observing Professor A · CS 3345', subtitle: 'Report submitted', kind: 'Observing' },
        { date: 'Nov 12, 2025', title: 'Observing Professor C · CS 2340', subtitle: 'Report submitted', kind: 'Observing' },
        { date: 'Nov 20, 2025', title: 'Formal evaluation', subtitle: 'Completed · Meets expectations', kind: 'Evaluation' },
      ],
      upcoming: [
        { date: 'Oct 14, 2026', title: 'Observing Professor A · CS 4348', subtitle: 'Awaiting confirmation', kind: 'Observing' },
      ],
      hireLevel: 'Associate Professor',
      cycle: 'Every 2 years (associate rule)',
      lastEvaluation: 'Nov 20, 2025',
      nextEvaluation: 'Fall 2027',
      instructorLevels: ['5000s', 'Observes 1000s–4000s'],
      canObserveThem: [
        { name: 'Professor I', rank: 'Full', detail: '6000s · CS 4348, CS 4375', courseLevel: '6000s' },
      ],
      theyCanObserve: [
        { name: 'Professor L', rank: 'Lecturer', detail: 'Unmatched · 2000s · CS 2305', courseLevel: '2000s' },
      ],
    },
  },
  {
    id: 8,
    name: 'Professor B',
    email: 'professor.b@utdallas.edu',
    level: 'Lecturer',
    courses: ['CS 3341'],
    completed: 1,
    required: 1,
    status: 'Up to date',
    statusTone: 'ok',
    nextEvaluationDate: '2027-09-01',
    dueThisCycle: false,
    unmatched: false,
    needsObserver: false,
    details: {
      past: [
        { date: 'Sep 30, 2025', title: 'Formal evaluation', subtitle: 'Completed · Meets expectations', kind: 'Evaluation' },
      ],
      upcoming: [
        { date: 'Sep 29, 2026', title: 'Observed by Professor H · CS 3341', subtitle: 'Confirmed', kind: 'Observed' },
      ],
      hireLevel: 'Lecturer',
      cycle: 'Every year (lecturer rule)',
      lastEvaluation: 'Sep 30, 2025',
      nextEvaluation: 'Fall 2027',
      instructorLevels: ['3000s', 'Observed by same-level colleagues in the same department'],
      canObserveThem: [
        { name: 'Professor H', rank: 'Assistant', detail: '3000s · CS 3305', courseLevel: '3000s' },
      ],
      theyCanObserve: [],
    },
  },
]
