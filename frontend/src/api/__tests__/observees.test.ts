import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentClasses, getTeachingHistory, type ProfessorClass } from '../observees'
import { fetchCall, mockFetch } from './mockFetch'

afterEach(() => vi.unstubAllGlobals())

const dbClass: ProfessorClass = {
  course_id: 2,
  course_code: 'CS 4347',
  course_name: 'Database Systems',
  section_id: 12,
  section_name: '001',
  meeting_days: 'TR',
  start_time: '13:00',
  end_time: '14:15',
}

describe('observee classes', () => {
  it("gets the professor's current classes", async () => {
    const body = { professor_id: 7, professor_name: 'Ada Lovelace', semester: 'Fall', year: 2026, classes: [dbClass] }
    const fetchMock = mockFetch(body)
    expect(await getCurrentClasses(7)).toEqual(body)
    expect(fetchCall(fetchMock).url).toBe('/api/observees/7/classes')
  })

  it('gets the teaching history', async () => {
    const body = {
      professor_id: 7,
      professor_name: 'Ada Lovelace',
      terms: [{ term_id: 5, semester: 'Fall', year: 2026, courses: ['CS 4347'], sections: 1, classes: [dbClass] }],
    }
    const fetchMock = mockFetch(body)
    expect(await getTeachingHistory(7)).toEqual(body)
    expect(fetchCall(fetchMock).url).toBe('/api/observees/7/teaching-history')
  })

  it('rejects with 404 for an unknown professor', async () => {
    mockFetch({ detail: 'Professor not found' }, 404)
    await expect(getCurrentClasses(999)).rejects.toMatchObject({ status: 404 })
    await expect(getTeachingHistory(999)).rejects.toMatchObject({ status: 404 })
  })
})
