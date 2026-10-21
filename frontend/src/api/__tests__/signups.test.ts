import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../client'
import { createSignup, getEligibleObservers, getObserveeSignup, type Signup } from '../signups'
import { fetchCall, mockFetch } from './mockFetch'

afterEach(() => vi.unstubAllGlobals())

const signup: Signup = {
  signup_id: 4,
  cycle_id: 2,
  professor_id: 7,
  professor_name: 'Ada Lovelace',
  section_id: 12,
  section_name: '001',
  course_code: 'CS 4347',
  course_name: 'Database Systems',
  preferred_times: 'Tuesdays',
  signup_date: '2026-09-01',
  signup_time: '09:30',
  status: 'Pending',
}
const observers = [{ observer_id: 8, name: 'Grace Hopper', department: 'Computer Science' }]

describe('signups', () => {
  it('posts a sign-up and returns the server-set id, date and time', async () => {
    const fetchMock = mockFetch({ ...signup, in_observer_pool: true, observers, insufficient: false })
    const created = await createSignup({ professor_id: 7, section_id: 12, preferred_times: 'Tuesdays' })

    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/api/signups')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ professor_id: 7, section_id: 12, preferred_times: 'Tuesdays' })
    expect(created).toMatchObject({ signup_id: 4, signup_date: '2026-09-01', signup_time: '09:30', observers })
  })

  it('exposes the existing sign-up on a 409', async () => {
    mockFetch({ detail: { message: 'Observee already signed up', existing_signup: signup } }, 409)
    const error = await createSignup({ professor_id: 7, section_id: 12 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).detail).toMatchObject({ existing_signup: { signup_id: 4 } })
  })

  it("gets the observee's sign-up, passing cycle_id only when given", async () => {
    const fetchMock = mockFetch({ ...signup, observers, insufficient: false })
    await getObserveeSignup(7)
    await getObserveeSignup(7, 2)
    expect(fetchCall(fetchMock, 0).url).toBe('/api/observees/7/signup')
    expect(fetchCall(fetchMock, 1).url).toBe('/api/observees/7/signup?cycle_id=2')
  })

  it('rejects with 404 when there is no sign-up', async () => {
    mockFetch({ detail: 'No signup for this cycle' }, 404)
    await expect(getObserveeSignup(7)).rejects.toMatchObject({ status: 404, message: 'No signup for this cycle' })
  })

  it('gets eligible observers for a sign-up', async () => {
    const body = {
      signup_id: 4,
      faculty_id: 7,
      faculty_name: 'Ada Lovelace',
      department_id: 1,
      department_name: 'Computer Science',
      course_id: 2,
      course_code: 'CS 4347',
      course_name: 'Database Systems',
      course_level: 4000,
      section_id: 12,
      meeting_days: 'TR',
      start_time: '13:00',
      end_time: '14:15',
      eligible_count: 1,
      insufficient: false,
      observers,
    }
    const fetchMock = mockFetch(body)
    expect(await getEligibleObservers(4)).toEqual(body)
    expect(fetchCall(fetchMock).url).toBe('/api/signups/4/eligible-observers')
  })
})
