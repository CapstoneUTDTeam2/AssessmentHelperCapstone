import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCourse, getCourseSummary, listCourses, summarizeCatalog, type CourseCatalog } from '../courses'
import { fetchCall, mockFetch } from './mockFetch'

afterEach(() => vi.unstubAllGlobals())

const section = (id: number, name: string) => ({
  section_id: id,
  section_name: name,
  meeting_days: 'MW',
  start_time: '10:00',
  end_time: '11:15',
  instructors: [{ professor_id: 1, professor_name: 'Ada Lovelace' }],
})

const catalog: CourseCatalog = {
  semester: 'Fall',
  year: 2026,
  courses: [
    { course_id: 1, course_code: 'CS 1337', course_name: 'Computer Science I', course_description: null, sections: [section(10, '001'), section(11, '002')] },
    { course_id: 2, course_code: 'CS 4347', course_name: 'Database Systems', course_description: 'SQL', sections: [section(12, '001')] },
    { course_id: 3, course_code: 'CS 6360', course_name: 'Database Design', course_description: null, sections: [] },
  ],
}

describe('courses', () => {
  it('lists the catalog', async () => {
    const fetchMock = mockFetch(catalog)
    expect(await listCourses()).toEqual(catalog)
    expect(fetchCall(fetchMock).url).toBe('/api/courses')
  })

  it('gets one course', async () => {
    const fetchMock = mockFetch({ semester: 'Fall', year: 2026, ...catalog.courses[1] })
    const course = await getCourse(2)
    expect(fetchCall(fetchMock).url).toBe('/api/courses/2')
    expect(course.course_code).toBe('CS 4347')
  })

  it('rejects with 404 for an unknown course', async () => {
    mockFetch({ detail: 'Course not found' }, 404)
    await expect(getCourse(404)).rejects.toMatchObject({ status: 404, message: 'Course not found' })
  })

  it('summarizes courses and sections, counting courses with no sections', () => {
    expect(summarizeCatalog(catalog)).toEqual({ term: 'Fall 2026', courseCount: 3, sectionCount: 3 })
  })

  it('fetches and summarizes', async () => {
    mockFetch(catalog)
    expect(await getCourseSummary()).toEqual({ term: 'Fall 2026', courseCount: 3, sectionCount: 3 })
  })
})
