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

export type EvaluationStatus =
  | 'Overdue'
  | 'Report overdue'
  | 'Not held'
  | 'Unmatched'
  | 'Not signed up'
  | 'Needs observer'
  | 'Confirmed'
  | 'Completed'

/**
 * Where a due professor is in finding an observer:
 * none = hasn't signed up, waiting = signed up with no observer chosen yet,
 * unmatched = selection found no eligible observers, observer = an observation is scheduled.
 */
export type SignupState = 'none' | 'waiting' | 'unmatched' | 'observer'

export interface EvaluationRow {
  id: number
  faculty: string
  level: HireLevel
  /** The semester they are due, e.g. "Fall 2026", or "—" when unknown. */
  dueTerm: string
  /** Sortable form of dueTerm, e.g. "2026-2"; unknown sorts last. */
  dueKey: string
  /** ISO date of their last completed evaluation, or null if never evaluated. */
  lastEvaluation: string | null
  signup: SignupState
  observer: string | null
  /** e.g. "CS 4386.001", once an observation is scheduled. */
  observation: string | null
  /** ISO date of the scheduled observation. */
  observationDate: string | null
  status: EvaluationStatus
  group: 'outstanding' | 'upcoming'
}
