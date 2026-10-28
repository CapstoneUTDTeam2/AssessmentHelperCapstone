// When an observer can observe this cycle (backend/app/api/observer_availability.py).
// The eligibility rule only matches observers whose weekly slots cover the class time.

import { apiGet, apiPut } from './client'

/** M, T, W, R (Thursday), F. */
export type AvailabilityWeekday = 'M' | 'T' | 'W' | 'R' | 'F'

export interface WeeklySlot {
  weekday: AvailabilityWeekday
  /** "HH:MM" (24h). */
  start_time: string
  end_time: string
}

export interface ObserverAvailability {
  professor_id: number
  professor_name: string
  cycle_id: number
  semester: string
  year: number
  /** Null until the professor signs up or saves availability. */
  enrollment_status: string | null
  weekly: (WeeklySlot & { weekday_name: string })[]
  unavailable_dates: string[]
}

export function getAvailability(professorId: number, signal?: AbortSignal) {
  return apiGet<ObserverAvailability>(`/api/observers/${professorId}/availability`, undefined, signal)
}

/** Replaces the slots and dates. Throws ApiError 400 for bad times or dates, or once the observation deadline passed. */
export function saveAvailability(
  professorId: number,
  body: { weekly: WeeklySlot[]; unavailable_dates: string[] },
  signal?: AbortSignal,
) {
  return apiPut<ObserverAvailability>(`/api/observers/${professorId}/availability`, body, undefined, signal)
}
