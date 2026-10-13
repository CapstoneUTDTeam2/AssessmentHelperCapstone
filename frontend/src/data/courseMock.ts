// Placeholder data for the Course Overview page. Swap these for CourseBook /
// API data once the backend endpoints are wired up.

import type { FacultyLevel } from './facultyMock'

export type Days = 'MW' | 'TR' | 'MWF'

/** ok = green badge, needsObserver / overdue = red badge. */
export type SectionTone = 'ok' | 'needsObserver' | 'overdue'

export interface Section {
  number: string
  instructor: string
  rank: FacultyLevel
  days: Days
  /** 24-hour "HH:MM". */
  start: string
  end: string
  room: string
  enrolled: number
  capacity: number
  status: string
  tone: SectionTone
}

export type Term = 'Spring' | 'Summer' | 'Fall'

export interface HistoryEntry {
  term: Term
  year: number
  instructor: string
  sections: number
}

export interface Course {
  code: string
  title: string
  creditHours: number
  prereqs: string[]
  department: string
  sections: Section[]
  history: HistoryEntry[]
}

export const TERM = 'Fall 2026'

const CS = 'Department of Computer Science'

export const COURSES: Course[] = [
  {
    code: 'CS 1336',
    title: 'Programming Fundamentals',
    creditHours: 3,
    prereqs: [],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor G', rank: 'Assistant Prof.', days: 'MW', start: '08:30', end: '09:45', room: 'ECSS 2.311', enrolled: 95, capacity: 100, status: 'Observed Feb 2026', tone: 'ok' },
      { number: '002', instructor: 'Professor H', rank: 'Assistant Prof.', days: 'TR', start: '10:00', end: '11:15', room: 'ECSS 2.410', enrolled: 88, capacity: 100, status: 'Evaluation Oct 14', tone: 'ok' },
      { number: '003', instructor: 'Professor G', rank: 'Assistant Prof.', days: 'TR', start: '14:30', end: '15:45', room: 'ECSS 2.311', enrolled: 70, capacity: 90, status: 'Observed Feb 2026', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor G', sections: 3 },
      { term: 'Fall', year: 2025, instructor: 'Professor H', sections: 2 },
      { term: 'Spring', year: 2025, instructor: 'Professor G', sections: 2 },
      { term: 'Fall', year: 2024, instructor: 'Professor C', sections: 2 },
    ],
  },
  {
    code: 'CS 1337',
    title: 'Computer Science I',
    creditHours: 3,
    prereqs: ['CS 1336'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor G', rank: 'Assistant Prof.', days: 'MW', start: '10:00', end: '11:15', room: 'ECSS 2.415', enrolled: 110, capacity: 120, status: 'Evaluation Sep 14', tone: 'ok' },
      { number: '002', instructor: 'Professor C', rank: 'Assistant Prof.', days: 'TR', start: '08:30', end: '09:45', room: 'ECSN 2.120', enrolled: 96, capacity: 100, status: 'Up to date', tone: 'ok' },
      { number: '003', instructor: 'Professor B', rank: 'Lecturer', days: 'MWF', start: '13:00', end: '13:50', room: 'ECSS 2.306', enrolled: 60, capacity: 80, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor G', sections: 2 },
      { term: 'Spring', year: 2026, instructor: 'Professor B', sections: 1 },
      { term: 'Fall', year: 2025, instructor: 'Professor C', sections: 2 },
      { term: 'Spring', year: 2025, instructor: 'Professor B', sections: 2 },
    ],
  },
  {
    code: 'CS 2336',
    title: 'Object-Oriented Programming',
    creditHours: 3,
    prereqs: ['CS 1337'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor A', rank: 'Associate Prof.', days: 'TR', start: '13:00', end: '14:15', room: 'ECSS 2.410', enrolled: 100, capacity: 110, status: 'Observed Oct 2025', tone: 'ok' },
      { number: '002', instructor: 'Professor C', rank: 'Assistant Prof.', days: 'MW', start: '16:00', end: '17:15', room: 'ECSN 2.126', enrolled: 74, capacity: 90, status: 'Needs observer', tone: 'needsObserver' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor A', sections: 2 },
      { term: 'Fall', year: 2025, instructor: 'Professor C', sections: 1 },
      { term: 'Spring', year: 2025, instructor: 'Professor A', sections: 2 },
    ],
  },
  {
    code: 'CS 3345',
    title: 'Data Structures & Algorithm Analysis',
    creditHours: 3,
    prereqs: ['CS 2336', 'CS 2305'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor A', rank: 'Associate Prof.', days: 'MW', start: '10:00', end: '11:15', room: 'ECSS 2.410', enrolled: 118, capacity: 120, status: 'Evaluation Sep 16', tone: 'ok' },
      { number: '002', instructor: 'Professor A', rank: 'Associate Prof.', days: 'MW', start: '13:00', end: '14:15', room: 'ECSS 2.410', enrolled: 104, capacity: 120, status: 'Observed Oct 2025', tone: 'ok' },
      { number: '003', instructor: 'Professor D', rank: 'Full Prof.', days: 'TR', start: '11:30', end: '12:45', room: 'ECSN 2.120', enrolled: 110, capacity: 110, status: 'Up to date', tone: 'ok' },
      { number: '004', instructor: 'Professor G', rank: 'Assistant Prof.', days: 'TR', start: '16:00', end: '17:15', room: 'ECSS 2.306', enrolled: 80, capacity: 90, status: 'Needs observer', tone: 'needsObserver' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor A', sections: 2 },
      { term: 'Spring', year: 2026, instructor: 'Professor D', sections: 1 },
      { term: 'Fall', year: 2025, instructor: 'Professor A', sections: 2 },
      { term: 'Fall', year: 2025, instructor: 'Professor F', sections: 1 },
      { term: 'Spring', year: 2025, instructor: 'Professor D', sections: 2 },
      { term: 'Spring', year: 2025, instructor: 'Professor I', sections: 1 },
      { term: 'Fall', year: 2024, instructor: 'Professor I', sections: 2 },
      { term: 'Fall', year: 2024, instructor: 'Professor L', sections: 1 },
      { term: 'Spring', year: 2024, instructor: 'Professor D', sections: 2 },
    ],
  },
  {
    code: 'CS 3354',
    title: 'Software Engineering',
    creditHours: 3,
    prereqs: ['CS 2336'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor K', rank: 'Assistant Prof.', days: 'MW', start: '14:30', end: '15:45', room: 'ECSS 2.415', enrolled: 85, capacity: 90, status: 'Up to date', tone: 'ok' },
      { number: '002', instructor: 'Professor H', rank: 'Assistant Prof.', days: 'TR', start: '10:00', end: '11:15', room: 'ECSN 2.112', enrolled: 78, capacity: 90, status: 'Evaluation Oct 21', tone: 'ok' },
      { number: '003', instructor: 'Professor K', rank: 'Assistant Prof.', days: 'TR', start: '13:00', end: '14:15', room: 'ECSS 2.415', enrolled: 66, capacity: 90, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor K', sections: 2 },
      { term: 'Fall', year: 2025, instructor: 'Professor H', sections: 1 },
      { term: 'Spring', year: 2025, instructor: 'Professor K', sections: 2 },
    ],
  },
  {
    code: 'CS 4348',
    title: 'Operating Systems Concepts',
    creditHours: 3,
    prereqs: ['CS 3345', 'CS 3340'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor A', rank: 'Associate Prof.', days: 'MW', start: '08:30', end: '09:45', room: 'ECSS 2.410', enrolled: 92, capacity: 100, status: 'Evaluation Oct 14', tone: 'ok' },
      { number: '002', instructor: 'Professor I', rank: 'Full Prof.', days: 'TR', start: '14:30', end: '15:45', room: 'ECSS 2.306', enrolled: 88, capacity: 100, status: 'Report overdue', tone: 'overdue' },
      { number: '003', instructor: 'Professor I', rank: 'Full Prof.', days: 'MW', start: '16:00', end: '17:15', room: 'ECSN 2.120', enrolled: 54, capacity: 80, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor I', sections: 2 },
      { term: 'Fall', year: 2025, instructor: 'Professor A', sections: 1 },
      { term: 'Spring', year: 2025, instructor: 'Professor I', sections: 2 },
      { term: 'Fall', year: 2024, instructor: 'Professor A', sections: 1 },
    ],
  },
  {
    code: 'CS 4375',
    title: 'Introduction to Machine Learning',
    creditHours: 3,
    prereqs: ['CS 3345', 'CS 3341'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor D', rank: 'Full Prof.', days: 'MW', start: '11:30', end: '12:45', room: 'ECSS 2.415', enrolled: 100, capacity: 100, status: 'Up to date', tone: 'ok' },
      { number: '002', instructor: 'Professor I', rank: 'Full Prof.', days: 'TR', start: '10:00', end: '11:15', room: 'ECSN 2.126', enrolled: 95, capacity: 100, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor D', sections: 1 },
      { term: 'Spring', year: 2026, instructor: 'Professor I', sections: 1 },
      { term: 'Fall', year: 2025, instructor: 'Professor D', sections: 2 },
    ],
  },
  {
    code: 'CS 4384',
    title: 'Automata Theory',
    creditHours: 3,
    prereqs: ['CS 2305', 'CS 3345'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor F', rank: 'Associate Prof.', days: 'TR', start: '08:30', end: '09:45', room: 'ECSS 2.311', enrolled: 72, capacity: 80, status: 'Up to date', tone: 'ok' },
      { number: '002', instructor: 'Professor F', rank: 'Associate Prof.', days: 'TR', start: '13:00', end: '14:15', room: 'ECSS 2.311', enrolled: 64, capacity: 80, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor F', sections: 2 },
      { term: 'Fall', year: 2025, instructor: 'Professor F', sections: 1 },
    ],
  },
  {
    code: 'CS 6363',
    title: 'Design and Analysis of Algorithms',
    creditHours: 3,
    prereqs: ['CS 5343'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor I', rank: 'Full Prof.', days: 'MW', start: '19:00', end: '20:15', room: 'ECSS 2.410', enrolled: 58, capacity: 60, status: 'Up to date', tone: 'ok' },
      { number: '002', instructor: 'Professor D', rank: 'Full Prof.', days: 'TR', start: '17:30', end: '18:45', room: 'ECSN 2.112', enrolled: 55, capacity: 60, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor I', sections: 1 },
      { term: 'Fall', year: 2025, instructor: 'Professor D', sections: 2 },
    ],
  },
  {
    code: 'CS 6375',
    title: 'Machine Learning',
    creditHours: 3,
    prereqs: ['CS 5343'],
    department: CS,
    sections: [
      { number: '001', instructor: 'Professor D', rank: 'Full Prof.', days: 'MW', start: '17:30', end: '18:45', room: 'ECSS 2.306', enrolled: 60, capacity: 60, status: 'Up to date', tone: 'ok' },
      { number: '002', instructor: 'Professor I', rank: 'Full Prof.', days: 'TR', start: '19:00', end: '20:15', room: 'ECSS 2.306', enrolled: 52, capacity: 60, status: 'Up to date', tone: 'ok' },
      { number: '003', instructor: 'Professor D', rank: 'Full Prof.', days: 'TR', start: '16:00', end: '17:15', room: 'ECSN 2.120', enrolled: 48, capacity: 60, status: 'Up to date', tone: 'ok' },
    ],
    history: [
      { term: 'Spring', year: 2026, instructor: 'Professor D', sections: 2 },
      { term: 'Fall', year: 2025, instructor: 'Professor I', sections: 2 },
      { term: 'Spring', year: 2025, instructor: 'Professor D', sections: 1 },
    ],
  },
]
