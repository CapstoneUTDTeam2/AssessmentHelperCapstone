// Placeholder data for the Reports page. Swap these for API responses once the
// backend endpoints are wired up.

import type { FacultyLevel } from './facultyMock'

export type ReportStatus = 'Awaiting sign-off' | 'Signed off' | 'Report overdue' | 'No report'

export type ReportOutcome = 'Exceeds expectations' | 'Meets expectations' | 'Needs improvement'

export interface ReportRow {
  id: number
  professor: string
  email: string
  level: FacultyLevel
  /** Avatar circle color from the design. */
  avatar: 'orange' | 'green'
  /** e.g. "Classroom observation"; null when no report exists yet. */
  reportType: string | null
  /** e.g. "Observed by Professor D · CS 1336-002". */
  reportDetail: string
  /** ISO date the report was filed, or the due date when it's still pending. */
  date: string | null
  outcome: ReportOutcome | null
  status: ReportStatus
}

export const REPORT_SUMMARY = {
  faculty: 64,
  onFile: 51,
  awaitingSignOff: 4,
  overdue: 2,
}

/** Reports dated on or after this count toward the current cycle. */
export const CYCLE_START = '2026-08-01'

export const REPORTS: ReportRow[] = [
  { id: 1, professor: 'Professor H', email: 'professor.h@utdallas.edu', level: 'Assistant Prof.', avatar: 'orange', reportType: 'Classroom observation', reportDetail: 'Observed by Professor D · CS 1336-002', date: '2026-09-02', outcome: 'Meets expectations', status: 'Awaiting sign-off' },
  { id: 2, professor: 'Professor D', email: 'professor.d@utdallas.edu', level: 'Full Prof.', avatar: 'green', reportType: 'Formal evaluation', reportDetail: 'Observed by Professor M · CS 6375-001', date: '2026-08-28', outcome: 'Exceeds expectations', status: 'Signed off' },
  { id: 3, professor: 'Professor C', email: 'professor.c@utdallas.edu', level: 'Assistant Prof.', avatar: 'green', reportType: 'Classroom observation', reportDetail: 'Observed by Professor F · CS 2305-002', date: '2026-08-19', outcome: 'Meets expectations', status: 'Awaiting sign-off' },
  { id: 4, professor: 'Professor B', email: 'professor.b@utdallas.edu', level: 'Lecturer', avatar: 'orange', reportType: 'Classroom observation', reportDetail: 'Observed by Professor H · CS 3341-001', date: '2026-05-21', outcome: 'Needs improvement', status: 'Awaiting sign-off' },
  { id: 5, professor: 'Professor F', email: 'professor.f@utdallas.edu', level: 'Associate Prof.', avatar: 'orange', reportType: 'Formal evaluation', reportDetail: 'Observed by Professor I · CS 3345-002', date: '2026-04-03', outcome: 'Meets expectations', status: 'Signed off' },
  { id: 6, professor: 'Professor I', email: 'professor.i@utdallas.edu', level: 'Full Prof.', avatar: 'green', reportType: 'Formal evaluation', reportDetail: 'Observed by Professor D · CS 4375-001', date: '2026-02-19', outcome: 'Exceeds expectations', status: 'Signed off' },
  { id: 7, professor: 'Professor J', email: 'professor.j@utdallas.edu', level: 'Associate Prof.', avatar: 'orange', reportType: 'Formal evaluation', reportDetail: 'Observed by Professor A · CS 2336-001', date: '2026-01-15', outcome: 'Meets expectations', status: 'Signed off' },
  { id: 8, professor: 'Professor M', email: 'professor.m@utdallas.edu', level: 'Full Prof.', avatar: 'green', reportType: 'Formal evaluation', reportDetail: 'Observed by Professor I · CS 6363-001', date: '2025-11-06', outcome: 'Meets expectations', status: 'Signed off' },
  { id: 9, professor: 'Professor A', email: 'professor.a@utdallas.edu', level: 'Associate Prof.', avatar: 'green', reportType: 'Formal evaluation', reportDetail: 'Observed by Professor F · CS 3345-001', date: '2025-03-12', outcome: 'Meets expectations', status: 'Signed off' },
  { id: 10, professor: 'Professor G', email: 'professor.g@utdallas.edu', level: 'Assistant Prof.', avatar: 'orange', reportType: 'Classroom observation', reportDetail: 'Observed by Professor I · CS 1337-002', date: '2026-09-14', outcome: null, status: 'Report overdue' },
  { id: 11, professor: 'Professor K', email: 'professor.k@utdallas.edu', level: 'Assistant Prof.', avatar: 'green', reportType: 'Classroom observation', reportDetail: 'Observed by Professor B · CS 3354-001', date: '2026-09-17', outcome: null, status: 'Report overdue' },
  { id: 12, professor: 'Professor L', email: 'professor.l@utdallas.edu', level: 'Lecturer', avatar: 'orange', reportType: null, reportDetail: 'No observer matched · CS 2305-001', date: null, outcome: null, status: 'No report' },
]
