// Observer requests: the observee asks observers from their saved list, observers
// confirm or decline, and the observee picks one (backend/app/api/observer_requests.py).

import { apiGet, apiPost } from './client'

/** Pending → Accepted / Declined by the observer, or Expired after 48 hours. Choosing an
 * observer turns other confirmations into Not Selected and unanswered requests into Cancelled. */
export type RequestStatus = 'Pending' | 'Accepted' | 'Declined' | 'Not Selected' | 'Cancelled' | 'Expired'

export interface ObserverRequest {
  request_id: number
  signup_id: number
  cycle_id: number
  status: RequestStatus
  observer_id: number
  observer_name: string
  observee_id: number
  observee_name: string
  course_code: string
  course_name: string
  section_id: number
  section_name: string
  meeting_days: string | null
  start_time: string | null
  end_time: string | null
  proposed_dates: string[]
  requested_at: string | null
  expires_at: string | null
  /** Set once the observee picked this observer. */
  observation_date: string | null
  /** Graceful-decline or withdrawn note for Not Selected / Cancelled requests. */
  message?: string
}

export interface SignupRequests {
  signup_id: number
  signup_status: string
  confirmed_count: number
  requests: ObserverRequest[]
}

export interface IncomingRequests {
  observer_id: number
  cycle_id: number
  confirmed_count: number
  max_confirmations: number
  pending_count: number
  requests: ObserverRequest[]
}

export interface ObserverChoice {
  observation_id: number
  signup_id: number
  observer_id: number
  observer_name: string
  observee_id: number
  observation_date: string
  start_time: string | null
  status: 'Scheduled'
  graceful_declines: { request_id: number; observer_name: string }[]
  withdrawn_requests: { request_id: number; observer_name: string }[]
}

/** Observee sends requests to observers on their saved list. `proposed_dates` only on the first send. */
export function sendObserverRequests(
  body: { signup_id: number; observee_id: number; observer_ids: number[]; proposed_dates?: string[] },
  signal?: AbortSignal,
) {
  return apiPost<{ signup_id: number; requests: ObserverRequest[] }>('/api/observer-requests', body, undefined, signal)
}

export function getSignupRequests(signupId: number, signal?: AbortSignal) {
  return apiGet<SignupRequests>(`/api/signups/${signupId}/requests`, undefined, signal)
}

export function getIncomingRequests(observerId: number, signal?: AbortSignal) {
  return apiGet<IncomingRequests>('/api/observer-requests', { observer_id: observerId }, signal)
}

export function getAcceptedConfirmations(observerId: number, signal?: AbortSignal) {
  return apiGet<{ observer_id: number; cycle_id: number; accepted: (ObserverRequest & { selected: boolean })[] }>(
    '/api/observer-requests/accepted',
    { observer_id: observerId },
    signal,
  )
}

/** Throws ApiError 409 past the 3-confirmation limit or once the observee chose someone. */
export function acceptRequest(requestId: number, observerId: number, signal?: AbortSignal) {
  return apiPost<ObserverRequest>(`/api/observer-requests/${requestId}/accept`, { observer_id: observerId }, undefined, signal)
}

export function declineRequest(requestId: number, observerId: number, signal?: AbortSignal) {
  return apiPost<ObserverRequest>(`/api/observer-requests/${requestId}/decline`, { observer_id: observerId }, undefined, signal)
}

/** Observee picks a confirmed observer; creates the Scheduled observation. */
export function selectObserver(
  signupId: number,
  body: { observee_id: number; observer_id: number; observation_date?: string },
  signal?: AbortSignal,
) {
  return apiPost<ObserverChoice>(`/api/signups/${signupId}/select-observer`, body, undefined, signal)
}
