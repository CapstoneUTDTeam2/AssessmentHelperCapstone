// Row and tile types for the committee Dashboard and Evaluations pages.

export type KpiAccent = 'green' | 'red' | 'black' | 'orange'

export interface Kpi {
  label: string
  detail: string
  value: string
  accent: KpiAccent
  /** Highlight the detail line (used for "on target" KPIs). */
  detailPositive?: boolean
}

export type HireLevel = 'Assistant' | 'Associate' | 'Full' | 'Lecturer'

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
