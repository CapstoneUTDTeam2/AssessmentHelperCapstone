// Placeholder data for the Evaluations page's statistics panel. Swap these for
// API responses once the backend endpoints are wired up. The KPI cards and the
// evaluations table reuse the dashboard mock data.

import type { HireLevel } from './dashboardMock'

export const CYCLE_SUMMARY = {
  facultyDue: 42,
  overdue: 12,
  unmatched: 5,
  totalEvaluations: 42,
}

export type CompletionSegment = 'Completed' | 'Scheduled' | 'Overdue' | 'Unmatched'

export const CYCLE_COMPLETION: { segment: CompletionSegment; count: number }[] = [
  { segment: 'Completed', count: 21 },
  { segment: 'Scheduled', count: 9 },
  { segment: 'Overdue', count: 7 },
  { segment: 'Unmatched', count: 5 },
]

export const ELIGIBILITY = {
  correct: 45,
  flaggedEarly: 2,
  missed: 1,
}

export const PARTICIPATION: { level: HireLevel; participating: number; total: number }[] = [
  { level: 'Assistant', participating: 16, total: 18 },
  { level: 'Associate', participating: 10, total: 11 },
  { level: 'Full', participating: 6, total: 7 },
  { level: 'Lecturer', participating: 4, total: 6 },
]

/** Participation below this share is highlighted as at risk. */
export const PARTICIPATION_TARGET = 0.75

/** Number of observers carrying each count of assigned observations. */
export const OBSERVER_WORKLOAD: { assigned: string; observers: number }[] = [
  { assigned: '0', observers: 7 },
  { assigned: '1', observers: 6 },
  { assigned: '2', observers: 7 },
  { assigned: '3', observers: 4 },
  { assigned: '4+', observers: 2 },
]
