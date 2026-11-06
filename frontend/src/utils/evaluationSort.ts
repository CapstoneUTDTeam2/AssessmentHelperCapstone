import type { EvaluationRow, EvaluationStatus } from '../data/dashboardMock'

/** Most urgent first, so sorting by status reads as a to-do list rather than alphabetically. */
export const STATUS_ORDER: EvaluationStatus[] = [
  'Overdue',
  'Report overdue',
  'Not held',
  'Unmatched',
  'Pending',
  'Confirmed',
  'Completed',
]

export type EvaluationSortKey = 'faculty' | 'level' | 'observer' | 'session' | 'due' | 'status'

/** Ascending comparison for one column; ties fall back to the due date, then the name. */
export function compareEvaluationRows(a: EvaluationRow, b: EvaluationRow, key: EvaluationSortKey): number {
  const byKey = (() => {
    switch (key) {
      case 'status':
        return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      // Session text mixes a semester and a course; its date lives in `due`.
      case 'session':
      case 'due':
        return a.due.localeCompare(b.due)
      case 'observer':
        // No observer yet sorts last.
        return (a.observer ?? '￿').localeCompare(b.observer ?? '￿')
      default:
        return a[key].localeCompare(b[key])
    }
  })()
  return byKey || a.due.localeCompare(b.due) || a.faculty.localeCompare(b.faculty)
}
