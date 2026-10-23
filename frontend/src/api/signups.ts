import { apiGet, apiPost } from './client'
import { ApiError } from './client'

export interface EligibleObserver {
  observer_id: number
  name: string
  department: string
}

export interface ObserveeSignup {
  signup_id: number
  cycle_id: number
  professor_id: number
  professor_name: string
  section_id: number
  section_name: string
  course_code: string
  course_name: string
  preferred_dates: string[]
  signup_date: string | null
  signup_time: string | null
  status: string
  observers?: EligibleObserver[]
  insufficient?: boolean
}

export function getObserveeSignup(professorId: number, signal?: AbortSignal) {
  return apiGet<ObserveeSignup>(`/api/observees/${professorId}/signup`, undefined, signal)
}

export async function getObserveeSignupOrNull(professorId: number, signal?: AbortSignal) {
  try {
    return await getObserveeSignup(professorId, signal)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export interface SignupMatch {
  signup_id?: number
  faculty_id: number
  faculty_name: string
  course_code: string
  course_name: string
  section_id: number
  meeting_days: string
  start_time: string
  end_time: string
  eligible_count: number
  insufficient: boolean
  observers: EligibleObserver[]
}

export interface SignupMatchList {
  cycle_id: number
  semester: string
  year: number
  signup_count: number
  insufficient_count: number
  signups: SignupMatch[]
}

export function getEligibleObservers(signupId: number, signal?: AbortSignal) {
  return apiGet<SignupMatch>(`/api/signups/${signupId}/eligible-observers`, undefined, signal)
}

export function listSignupMatches(signal?: AbortSignal) {
  return apiPost<SignupMatchList>('/api/match-observers/signups', undefined, signal)
}

export function createSignup(
  body: { professor_id: number; section_id: number; preferred_dates: string[]; cycle_id?: number },
  signal?: AbortSignal,
) {
  return apiPost<ObserveeSignup>('/api/signups', body, signal)
}
