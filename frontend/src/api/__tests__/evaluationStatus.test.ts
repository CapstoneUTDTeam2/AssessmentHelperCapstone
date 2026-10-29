import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countByLevel,
  getDueCountByLevel,
  getFacultySummary,
  type ProfessorEvaluationStatus,
} from '../evaluationStatus'
import { fetchCall, mockFetch } from './mockFetch'

afterEach(() => vi.unstubAllGlobals())

const prof = (id: number, level: string | null, status: ProfessorEvaluationStatus['status']): ProfessorEvaluationStatus => ({
  professor_id: id,
  name: `Prof ${id}`,
  current_level: level,
  start_term_id: 1,
  frequency_years: 1,
  last_evaluation_date: null,
  next_due_year: null,
  next_due_semester: null,
  status,
})

const term = { semester: 'Fall', year: 2026 }

describe('faculty summaries', () => {
  it('counts by level and labels a missing level Unknown', () => {
    const rows = [prof(1, 'Assistant Professor', 'Due'), prof(2, 'Full Professor', 'Not Due'), prof(3, 'Assistant Professor', 'Due'), prof(4, null, 'Unknown')]
    expect(countByLevel(rows)).toEqual([
      { level: 'Assistant Professor', count: 2 },
      { level: 'Full Professor', count: 1 },
      { level: 'Unknown', count: 1 },
    ])
  })

  it('builds the faculty summary from every professor', async () => {
    const fetchMock = mockFetch({ current_term: term, professors: [prof(1, 'Assistant Professor', 'Due'), prof(2, 'Associate Professor', 'Overdue')] })
    expect(await getFacultySummary()).toEqual({
      totalFaculty: 2,
      countByRank: [
        { level: 'Assistant Professor', count: 1 },
        { level: 'Associate Professor', count: 1 },
      ],
    })
    expect(fetchCall(fetchMock).url).toBe('/api/evaluation-status')
  })

  it('counts due professors by level from the due route', async () => {
    const fetchMock = mockFetch({ current_term: term, professors: [prof(1, 'Assistant Professor', 'Due'), prof(3, 'Assistant Professor', 'Due')] })
    expect(await getDueCountByLevel()).toEqual([{ level: 'Assistant Professor', count: 2 }])
    expect(fetchCall(fetchMock).url).toBe('/api/evaluation-status/due')
  })

  it('handles an empty faculty', async () => {
    mockFetch({ current_term: term, professors: [] })
    expect(await getFacultySummary()).toEqual({ totalFaculty: 0, countByRank: [] })
  })
})
