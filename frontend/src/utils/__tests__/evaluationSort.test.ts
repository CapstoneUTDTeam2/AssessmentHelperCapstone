import { describe, expect, it } from 'vitest'
import type { EvaluationRow, EvaluationStatus } from '../../data/dashboardMock'
import { compareEvaluationRows } from '../evaluationSort'

const row = (faculty: string, status: EvaluationStatus, extra: Partial<EvaluationRow> = {}): EvaluationRow => ({
  id: faculty.length,
  faculty,
  level: 'Assistant',
  dueTerm: 'Fall 2026',
  dueKey: '2026-2',
  lastEvaluation: null,
  signup: 'none',
  observer: null,
  observation: null,
  observationDate: null,
  status,
  group: 'outstanding',
  ...extra,
})

const sortBy = (rows: EvaluationRow[], key: Parameters<typeof compareEvaluationRows>[2]) =>
  rows.sort((a, b) => compareEvaluationRows(a, b, key)).map((r) => r.faculty)

describe('compareEvaluationRows', () => {
  it('sorts status by urgency, not alphabetically', () => {
    const rows = [
      row('A', 'Completed'),
      row('B', 'Confirmed'),
      row('C', 'Overdue'),
      row('D', 'Needs observer'),
      row('E', 'Not held'),
      row('F', 'Not signed up'),
    ]
    expect(sortBy(rows, 'status')).toEqual(['C', 'E', 'F', 'D', 'B', 'A'])
  })

  it('sorts the due semester in time order', () => {
    const rows = [row('A', 'Overdue', { dueKey: '2026-2' }), row('B', 'Overdue', { dueKey: '2025-1' }), row('C', 'Overdue', { dueKey: '2026-1' })]
    expect(sortBy(rows, 'due')).toEqual(['B', 'C', 'A'])
  })

  it('puts missing last evaluations, observers and observation dates last', () => {
    const rows = [
      row('A', 'Overdue'),
      row('B', 'Confirmed', { lastEvaluation: '2025-10-14', observer: 'Zed', observationDate: '2026-10-20' }),
      row('C', 'Confirmed', { lastEvaluation: '2024-03-15', observer: 'Amy', observationDate: '2026-10-05' }),
    ]
    expect(sortBy([...rows], 'lastEvaluation')).toEqual(['C', 'B', 'A'])
    expect(sortBy([...rows], 'observer')).toEqual(['C', 'B', 'A'])
    expect(sortBy([...rows], 'observation')).toEqual(['C', 'B', 'A'])
  })

  it('breaks ties by due semester, then name', () => {
    const rows = [row('B', 'Overdue'), row('A', 'Overdue'), row('C', 'Overdue', { dueKey: '2025-2' })]
    expect(sortBy(rows, 'status')).toEqual(['C', 'A', 'B'])
  })
})
