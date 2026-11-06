import { describe, expect, it } from 'vitest'
import type { EvaluationRow, EvaluationStatus } from '../../data/dashboardMock'
import { compareEvaluationRows } from '../evaluationSort'

const row = (faculty: string, status: EvaluationStatus, due: string, observer: string | null = null): EvaluationRow => ({
  id: faculty.length,
  faculty,
  level: 'Assistant',
  observer,
  session: 'Fall 2026',
  due,
  status,
  group: 'outstanding',
})

const names = (rows: EvaluationRow[]) => rows.map((r) => r.faculty)

describe('compareEvaluationRows', () => {
  it('sorts status by urgency, not alphabetically', () => {
    const rows = [
      row('A', 'Completed', '2026-10-01'),
      row('B', 'Confirmed', '2026-10-01'),
      row('C', 'Overdue', '2026-10-01'),
      row('D', 'Pending', '2026-10-01'),
      row('E', 'Not held', '2026-10-01'),
    ]
    expect(names(rows.sort((a, b) => compareEvaluationRows(a, b, 'status')))).toEqual(['C', 'E', 'D', 'B', 'A'])
  })

  it('sorts session by its date', () => {
    const rows = [row('A', 'Pending', '2026-11-20'), row('B', 'Pending', '2026-08-01'), row('C', 'Pending', '2026-10-05')]
    expect(names(rows.sort((a, b) => compareEvaluationRows(a, b, 'session')))).toEqual(['B', 'C', 'A'])
  })

  it('puts rows with no observer last', () => {
    const rows = [row('A', 'Pending', '2026-10-01'), row('B', 'Confirmed', '2026-10-01', 'Zed'), row('C', 'Confirmed', '2026-10-01', 'Amy')]
    expect(names(rows.sort((a, b) => compareEvaluationRows(a, b, 'observer')))).toEqual(['C', 'B', 'A'])
  })

  it('breaks ties by due date, then name', () => {
    const rows = [row('B', 'Overdue', '2026-10-01'), row('A', 'Overdue', '2026-10-01'), row('C', 'Overdue', '2026-09-01')]
    expect(names(rows.sort((a, b) => compareEvaluationRows(a, b, 'status')))).toEqual(['C', 'A', 'B'])
  })
})
