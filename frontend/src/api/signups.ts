// Be-observed sign-ups and the observers matched to them
// (backend/app/api/observee_signup.py, observer_matching.py).

import { apiGet, apiPost } from './client'

export interface Signup {
  signup_id: number
  cycle_id: number
  professor_id: number
  professor_name: string
  section_id: number
  section_name: string
  course_code: string
  course_name: string
  /** Free text; the backend stores ObservationSignup.PreferredTimes, not a list of dates. */
  preferred_times: string | null
  /** ISO date, set by the server. */
  signup_date: string | null
  /** "HH:MM", set by the server. */
  signup_time: string | null
  status: string
}

export interface EligibleObserver {
  observer_id: number
  name: string
  department: string
}

export interface ObserverMatches {
  observers: EligibleObserver[]
  /** True when no observer qualifies. */
  insufficient: boolean
}

export type SignupWithObservers = Signup & ObserverMatches
export type CreatedSignup = SignupWithObservers & { in_observer_pool: boolean }

export interface SignupMatchResult extends ObserverMatches {
  signup_id: number
  faculty_id: number
  faculty_name: string
  department_id: number
  department_name: string
  course_id: number
  course_code: string
  course_name: string
  /** First digit of the course number times 1000 (e.g. 4000 for CS 4347). */
  course_level: number
  section_id: number
  meeting_days: string | null
  start_time: string | null
  end_time: string | null
  eligible_count: number
}

export interface SignupRequest {
  professor_id: number
  section_id: number
  preferred_times?: string
  /** Defaults to the current cycle. */
  cycle_id?: number
}

/**
 * Signs the professor up to be observed in one of their sections.
 * Throws ApiError 400 (wrong term, past deadline, not their section),
 * 404 (unknown professor/section) or 409 (already signed up this cycle).
 */
export function createSignup(request: SignupRequest, signal?: AbortSignal) {
  return apiPost<CreatedSignup>('/api/signups', request, undefined, signal)
}

/** The professor's sign-up for the cycle. Throws ApiError 404 if they have none. */
export function getObserveeSignup(professorId: number, cycleId?: number, signal?: AbortSignal) {
  return apiGet<SignupWithObservers>(`/api/observees/${professorId}/signup`, { cycle_id: cycleId }, signal)
}

/** Up to 5 eligible observers for a sign-up. Throws ApiError 404 if the sign-up doesn't exist. */
export function getEligibleObservers(signupId: number, signal?: AbortSignal) {
  return apiGet<SignupMatchResult>(`/api/signups/${signupId}/eligible-observers`, undefined, signal)
}
