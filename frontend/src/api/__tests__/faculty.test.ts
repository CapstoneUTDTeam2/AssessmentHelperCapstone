import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFaculty } from '../faculty'

afterEach(() => vi.unstubAllGlobals())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Answers each request by its path; unknown paths 404. */
function routeFetch(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.split('?')[0]
    return path in routes ? json(routes[path]) : json({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const status = (professor_id: number, name: string, current_level: string, s = 'Not Due') => ({
  professor_id,
  name,
  current_level,
  frequency_years: 2,
  last_evaluation_date: '2025-03-12',
  next_due_year: 2027,
  next_due_semester: 'Spring',
  status: s,
})

const cls = (course_code: string, section_id: number) => ({
  course_id: section_id,
  course_code,
  course_name: course_code,
  section_id,
  section_name: '001',
  meeting_days: 'MW',
  start_time: '09:00',
  end_time: '10:15',
})

const match = (signup_id: number, faculty_id: number, faculty_name: string, course_code: string, observerIds: number[]) => ({
  signup_id,
  faculty_id,
  faculty_name,
  department_id: 1,
  department_name: 'Computer Science',
  course_id: 1,
  course_code,
  course_name: course_code,
  course_level: Number(course_code.match(/\d/)![0]) * 1000,
  section_id: 1,
  meeting_days: 'MW',
  start_time: '09:00',
  end_time: '10:15',
  eligible_count: observerIds.length,
  insufficient: observerIds.length === 0,
  observers: observerIds.map((id) => ({ observer_id: id, name: `Prof ${id}`, department: 'Computer Science' })),
})

describe('getFaculty', () => {
  it('fills courses, levels, unmatched and who they can observe from the backend', async () => {
    const fetchMock = routeFetch({
      '/api/evaluation-status': {
        current_term: { semester: 'Fall', year: 2026 },
        professors: [status(1, 'Alice', 'Assistant Professor', 'Due'), status(2, 'Bob', 'Full Professor'), status(3, 'Cy', 'Associate Professor')],
      },
      '/api/observees/1/classes': { classes: [cls('CS 3354', 2), cls('CS 1337', 1), cls('CS 1337', 3)] },
      '/api/observees/2/classes': { classes: [cls('CS 4347', 4)] },
      // Professor 3's classes 404 and should come back empty.
      '/api/match-observers/signups': {
        cycle_id: 2,
        semester: 'Fall',
        year: 2026,
        signup_count: 2,
        insufficient_count: 1,
        signups: [match(10, 1, 'Alice', 'CS 1337', [2]), match(11, 3, 'Cy', 'CS 2336', [])],
      },
    })

    const { term, members } = await getFaculty()
    const [alice, bob, cy] = members

    expect(term).toEqual({ semester: 'Fall', year: 2026 })
    expect(alice.courses).toEqual(['CS 1337', 'CS 3354'])
    expect(alice.unmatched).toBe(false)

    expect(bob.unmatched).toBe(false)
    expect(bob.details.theyCanObserve).toEqual([
      { name: 'Alice', rank: 'Assistant Prof.', detail: 'Due this semester · CS 1337', courseLevel: '1000s' },
    ])

    expect(cy.courses).toEqual([])
    expect(cy.unmatched).toBe(true)

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][]
    const methods = calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`)
    expect(methods).toContain('POST /api/match-observers/signups')
  })

  it('still loads when there is no current cycle to match', async () => {
    routeFetch({
      '/api/evaluation-status': { current_term: { semester: 'Fall', year: 2026 }, professors: [status(1, 'Alice', 'Assistant Professor')] },
      '/api/observees/1/classes': { classes: [cls('CS 1337', 1)] },
    })
    const { members } = await getFaculty()
    expect(members[0]).toMatchObject({ courses: ['CS 1337'], unmatched: false })
  })

  it('fails when a route errors with something other than 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('/api/evaluation-status')
          ? json({ current_term: { semester: 'Fall', year: 2026 }, professors: [status(1, 'Alice', 'Assistant Professor')] })
          : json({ detail: 'Database unavailable' }, 500),
      ),
    )
    await expect(getFaculty()).rejects.toMatchObject({ status: 500 })
  })
})
