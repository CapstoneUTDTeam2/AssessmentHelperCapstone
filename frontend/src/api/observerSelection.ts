import { apiGet, apiPost } from './client'

export interface ListedObserver {
  observer_id: number
  name: string
  department: string
}

export interface SelectionSignup {
  signup_id: number
  professor_id: number
  professor_name: string
  course_code: string
  course_name: string
  section_id: number
  section_name: string
  status: string
  observers: ListedObserver[]
  eligible_count?: number
}

export interface ObserverAlert {
  signup_id: number
  professor_id: number
  professor_name: string
  course_code: string
  section_id: number
  eligible_count: number
  level: 'none' | 'low'
  message: string
}

export interface ObserverAlerts {
  cycle_id: number
  semester: string
  year: number
  alert_count: number
  no_match_count: number
  alerts: ObserverAlert[]
}

export interface ObserverSelectionResult {
  cycle_id: number
  semester: string
  year: number
  started_on?: string
  signup_count: number
  matched_count?: number
  unmatched_count?: number
  alert_count?: number
  notified_count?: number
  signups: SelectionSignup[]
  alerts?: ObserverAlert[]
}

export interface ObserveeNotification {
  /** observer_list_ready once the committee sends the list; survey_open once it sends the survey notice. */
  type: 'observer_list_ready' | 'survey_open'
  signup_id: number
  status: string
  message: string
  observers: ListedObserver[]
  course_code?: string
  section_name?: string
  /** ISO survey deadline, on survey_open. */
  due?: string
}

export function getObserverAlerts(signal?: AbortSignal) {
  return apiGet<ObserverAlerts>('/api/observer-selection/alerts', undefined, signal)
}

export function startObserverSelection(signal?: AbortSignal) {
  return apiPost<ObserverSelectionResult>('/api/observer-selection/start', undefined, undefined, signal)
}

export function notifyObservees(signupId?: number, signal?: AbortSignal) {
  return apiPost<ObserverSelectionResult>(
    '/api/observer-selection/notify',
    undefined,
    signupId === undefined ? undefined : { signup_id: signupId },
    signal,
  )
}

export function getSignupObserverList(signupId: number, signal?: AbortSignal) {
  return apiGet<SelectionSignup & { list_saved: boolean }>(
    `/api/signups/${signupId}/observer-list`,
    undefined,
    signal,
  )
}

export function getObserveeNotifications(professorId: number, signal?: AbortSignal) {
  return apiGet<{ professor_id: number; notifications: ObserveeNotification[] }>(
    `/api/observees/${professorId}/notifications`,
    undefined,
    signal,
  )
}
