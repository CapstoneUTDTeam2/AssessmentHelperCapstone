import type { EvaluationRow, EvaluationStatus } from '../data/dashboardMock'

/** Most urgent first, so sorting by status reads as a to-do list rather than alphabetically. */
export const STATUS_ORDER: EvaluationStatus[] = [
  'Overdue',
  'Report overdue',
  'Not held',
  'Unmatched',
  'Not signed up',
  'Needs observer',
  'Confirmed',
  'Completed',
]

export type EvaluationSortKey =
  | 'faculty'
  | 'level'
  | 'due'
  | 'lastEvaluation'
  | 'observer'
  | 'observation'
  | 'status'

// Missing values sort last in ascending order.
const LAST = '￿'

/** Ascending comparison for one column; ties fall back to the due semester, then the name. */
export function compareEvaluationRows(a: EvaluationRow, b: EvaluationRow, key: EvaluationSortKey): number {
  const byKey = (() => {
    switch (key) {
      case 'status':
        return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      case 'due':
        return a.dueKey.localeCompare(b.dueKey)
      case 'lastEvaluation':
        return (a.lastEvaluation ?? LAST).localeCompare(b.lastEvaluation ?? LAST)
      case 'observer':
        return (a.observer ?? LAST).localeCompare(b.observer ?? LAST)
      case 'observation':
        return (a.observationDate ?? LAST).localeCompare(b.observationDate ?? LAST)
      default:
        return a[key].localeCompare(b[key])
    }
  })()
  return byKey || a.dueKey.localeCompare(b.dueKey) || a.faculty.localeCompare(b.faculty)
}
