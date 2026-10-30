// Be-observed sign-ups and the observers matched to them
// (backend/app/api/observee_signup.py, observer_matching.py).

import { ApiError, apiGet, apiPost } from './client'

export interface EligibleObserver {
  observer_id: number
  name: string
  department: string
}

export interface Signup {
  signup_id: number
  cycle_id: number
  professor_id: number
  professor_name: string
  section_id: number
  section_name: string
  course_code: string
  course_name: string
  /** ISO dates the professor would like to be observed on. */
  preferred_dates: string[]
  /** ISO date, set by the server. */
  signup_date: string | null
  /** "HH:MM", set by the server. */
  signup_time: string | null
  status: string
}

export interface ObserverMatches {
  observers: EligibleObserver[]
  /** True when no observer qualifies. */
  insufficient: boolean
}

export type SignupWithObservers = Signup & ObserverMatches
export type CreatedSignup = SignupWithObservers & { in_observer_pool: boolean }
/** A professor's sign-up; observer matches may not be attached yet. */
export type ObserveeSignup = Signup & Partial<ObserverMatches>

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

export interface SignupRequest {
  professor_id: number
  section_id: number
  preferred_dates?: string[]
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

/** Like getObserveeSignup, but null instead of a 404 when they haven't signed up. */
export async function getObserveeSignupOrNull(professorId: number, signal?: AbortSignal): Promise<ObserveeSignup | null> {
  try {
    return await getObserveeSignup(professorId, undefined, signal)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Up to 5 eligible observers for a sign-up. Throws ApiError 404 if the sign-up doesn't exist. */
export function getEligibleObservers(signupId: number, signal?: AbortSignal) {
  return apiGet<SignupMatchResult>(`/api/signups/${signupId}/eligible-observers`, undefined, signal)
}

/** Eligible observers for every sign-up in the current cycle. */
export function listSignupMatches(signal?: AbortSignal) {
  return apiPost<SignupMatchList>('/api/match-observers/signups', undefined, undefined, signal)
}

export interface DueMatch {
  faculty_id: number
  faculty_name: string
  evaluation_status: 'Due' | 'Overdue'
  signed_up: boolean
  course_code: string | null
  course_name: string | null
  section_id: number | null
  meeting_days: string | null
  start_time: string | null
  end_time: string | null
  eligible_count: number
  insufficient: boolean
  observers: EligibleObserver[]
  reason?: string
}

export interface DueMatchList {
  cycle_id: number
  semester: string
  year: number
  assumed_due_signups?: boolean
  faculty_count: number
  insufficient_count: number
  faculty: DueMatch[]
}

/** Tester preview: potential observers if every Due professor signed up. */
export function getDueMatches(signal?: AbortSignal) {
  return apiGet<DueMatchList>('/api/due-matches', undefined, signal)
}
