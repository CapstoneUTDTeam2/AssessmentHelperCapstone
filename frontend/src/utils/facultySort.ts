import type { FacultyMember, StatusTone } from '../data/facultyMock'

/** Most urgent first: overdue, then due, then unknown rank, then up to date. */
export const TONE_ORDER: StatusTone[] = ['overdue', 'due', 'unknown', 'ok']

/** Sorts by evaluation status, then by the next due semester, then by name. */
export function compareFacultyStatus(a: FacultyMember, b: FacultyMember): number {
  return (
    TONE_ORDER.indexOf(a.statusTone) - TONE_ORDER.indexOf(b.statusTone) ||
    a.nextEvaluationDate.localeCompare(b.nextEvaluationDate) ||
    a.name.localeCompare(b.name)
  )
}
