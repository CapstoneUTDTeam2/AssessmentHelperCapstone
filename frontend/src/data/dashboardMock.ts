// Placeholder data for the Evaluation Committee Dashboard. Swap these for API
// responses once the backend endpoints are wired up.

export type KpiAccent = 'green' | 'red' | 'black' | 'orange'

export interface Kpi {
  label: string
  detail: string
  value: string
  accent: KpiAccent
  /** Highlight the detail line (used for "on target" KPIs). */
  detailPositive?: boolean
}

export const KPIS: Kpi[] = [
  { label: 'Eligibility Accuracy', detail: '45 of 48 correct · KPI 1.1', value: '94%', accent: 'green', detailPositive: true },
  { label: 'Overdue Evaluations', detail: '+3 this week · KPI 1.2', value: '12', accent: 'red' },
  { label: 'Participation Rate', detail: '56 of 64 faculty · KPI 2.1', value: '87%', accent: 'black', detailPositive: true },
  { label: 'Observer Utilization', detail: '19 of 26 assigned · KPI 2.2', value: '73%', accent: 'orange' },
  { label: 'Avg. Observations / Observer', detail: '46 assigned · KPI 2.3', value: '2.4', accent: 'green' },
]

export type HireLevel = 'Assistant' | 'Associate' | 'Full' | 'Lecturer'

export const HIRE_LEVEL_COUNTS: { level: HireLevel; count: number }[] = [
  { level: 'Assistant', count: 18 },
  { level: 'Associate', count: 11 },
  { level: 'Full', count: 7 },
  { level: 'Lecturer', count: 6 },
]

export type EvaluationStatus = 'Overdue' | 'Report overdue' | 'Unmatched' | 'Pending' | 'Confirmed' | 'Completed'

export interface EvaluationRow {
  id: number
  faculty: string
  level: HireLevel
  observer: string | null
  session: string
  /** ISO date (YYYY-MM-DD). */
  due: string
  status: EvaluationStatus
  group: 'outstanding' | 'upcoming'
}

/** Fixed "today" so the mock data's due dates stay meaningful. */
export const MOCK_TODAY = '2026-09-18'

export const EVALUATIONS: EvaluationRow[] = [
  { id: 1, faculty: 'Professor G', level: 'Assistant', observer: 'Professor I', session: 'CS 1337-002 · Sep 14', due: '2026-09-14', status: 'Overdue', group: 'outstanding' },
  { id: 2, faculty: 'Professor K', level: 'Assistant', observer: 'Professor B', session: 'CS 3354-001 · Sep 10', due: '2026-09-17', status: 'Report overdue', group: 'outstanding' },
  { id: 3, faculty: 'Professor L', level: 'Lecturer', observer: null, session: 'CS 2305-001 · —', due: '2026-09-28', status: 'Unmatched', group: 'outstanding' },
  { id: 4, faculty: 'Professor A', level: 'Associate', observer: 'Professor F', session: 'CS 4348-001 · Oct 14', due: '2026-10-21', status: 'Pending', group: 'outstanding' },
  { id: 5, faculty: 'Professor A', level: 'Associate', observer: 'Professor I', session: 'CS 3345-001 · Sep 16', due: '2026-09-23', status: 'Confirmed', group: 'upcoming' },
  { id: 6, faculty: 'Professor H', level: 'Assistant', observer: 'Professor A', session: 'CS 1336-002 · Oct 14', due: '2026-10-21', status: 'Pending', group: 'upcoming' },
  { id: 7, faculty: 'Professor C', level: 'Assistant', observer: 'Professor A', session: 'CS 2305-002 · Sep 24', due: '2026-10-01', status: 'Confirmed', group: 'upcoming' },
  { id: 8, faculty: 'Professor B', level: 'Lecturer', observer: 'Professor H', session: 'CS 3341-001 · Sep 29', due: '2026-10-06', status: 'Confirmed', group: 'upcoming' },
]
