import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deadlineDate,
  getCurrentEvaluationCycle,
  getEvaluationCycle,
  getServerDate,
  listEvaluationCycles,
  updateCycleDeadlines,
  type EvaluationCycle,
} from '../evaluationCycles'
import { fetchCall, mockFetch } from './mockFetch'

afterEach(() => vi.unstubAllGlobals())

const cycle: EvaluationCycle = {
  cycle_id: 2,
  term_id: 5,
  semester: 'Fall',
  year: 2026,
  today: '2026-10-20',
  phase: 'observation',
  next_deadline: { key: 'observation', label: 'observation', date: '2026-11-15', is_open: true, days_left: 26 },
  deadlines: [
    { key: 'signup', label: 'signup', date: '2026-09-15', is_open: false, days_left: -35 },
    { key: 'observation', label: 'observation', date: '2026-11-15', is_open: true, days_left: 26 },
    { key: 'post_observation_feedback', label: 'post-observation feedback', date: '2026-11-30', is_open: true, days_left: 41 },
    { key: 'app_feedback', label: 'app feedback', date: '2026-12-10', is_open: true, days_left: 51 },
  ],
}

describe('evaluation cycles', () => {
  it('lists cycles', async () => {
    const fetchMock = mockFetch({ cycles: [cycle] })
    expect(await listEvaluationCycles()).toEqual([cycle])
    expect(fetchCall(fetchMock).url).toBe('/api/evaluation-cycles')
  })

  it('gets the current cycle', async () => {
    const fetchMock = mockFetch(cycle)
    expect(await getCurrentEvaluationCycle()).toEqual(cycle)
    expect(fetchCall(fetchMock).url).toBe('/api/evaluation-cycles/current')
  })

  it('gets one cycle by id', async () => {
    const fetchMock = mockFetch(cycle)
    await getEvaluationCycle(2)
    expect(fetchCall(fetchMock).url).toBe('/api/evaluation-cycles/2')
  })

  it('rejects with 404 for an unknown cycle', async () => {
    mockFetch({ detail: 'Evaluation cycle 99 not found' }, 404)
    await expect(getEvaluationCycle(99)).rejects.toMatchObject({ status: 404 })
  })

  it('puts only the deadlines given', async () => {
    const fetchMock = mockFetch(cycle)
    await updateCycleDeadlines(2, { signup: '2026-09-20', observation: '2026-11-20' })
    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/api/evaluation-cycles/2/deadlines')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ signup: '2026-09-20', observation: '2026-11-20' })
  })

  it('surfaces a deadline-order error', async () => {
    mockFetch({ detail: 'Signup deadline must be on or before the observation deadline' }, 400)
    await expect(updateCycleDeadlines(2, { signup: '2027-01-01' })).rejects.toMatchObject({
      status: 400,
      message: 'Signup deadline must be on or before the observation deadline',
    })
  })

  it('reads a deadline by key', () => {
    expect(deadlineDate(cycle, 'signup')).toBe('2026-09-15')
    expect(deadlineDate({ ...cycle, deadlines: [] }, 'signup')).toBeNull()
  })

  it('gets the server date from the current cycle', async () => {
    const fetchMock = mockFetch(cycle)
    expect(await getServerDate()).toBe('2026-10-20')
    expect(fetchCall(fetchMock).url).toBe('/api/evaluation-cycles/current')
  })
})
