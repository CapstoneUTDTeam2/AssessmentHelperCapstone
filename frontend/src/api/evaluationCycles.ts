// Evaluation cycles and their deadlines (backend/app/api/cycle_deadlines.py).
// Covers "Cycle list", "Update deadlines", "Server date" and the Cycle settings tab.

import { apiGet, apiPut } from './client'

export type DeadlineKey = 'signup' | 'observation' | 'post_observation_feedback' | 'app_feedback'
export type CyclePhase = DeadlineKey | 'closed'

export interface CycleDeadline {
  key: DeadlineKey
  label: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  is_open: boolean
  /** Negative once the deadline has passed. */
  days_left: number
}

export interface EvaluationCycle {
  cycle_id: number
  term_id: number
  semester: 'Spring' | 'Summer' | 'Fall'
  year: number
  /** Campus (America/Chicago) date on the server, ISO. */
  today: string
  phase: CyclePhase
  next_deadline: CycleDeadline | null
  deadlines: CycleDeadline[]
}

/** Dates left out keep their current value. Dates are ISO (YYYY-MM-DD). */
export type DeadlineUpdate = Partial<Record<DeadlineKey, string>>

/** Every cycle, newest first. */
export async function listEvaluationCycles(signal?: AbortSignal) {
  const { cycles } = await apiGet<{ cycles: EvaluationCycle[] }>('/api/evaluation-cycles', undefined, signal)
  return cycles
}

/** The latest Spring/Fall cycle. Throws ApiError 404 if there is none. */
export function getCurrentEvaluationCycle(signal?: AbortSignal) {
  return apiGet<EvaluationCycle>('/api/evaluation-cycles/current', undefined, signal)
}

/** One cycle. Throws ApiError 404 if not found. */
export function getEvaluationCycle(cycleId: number, signal?: AbortSignal) {
  return apiGet<EvaluationCycle>(`/api/evaluation-cycles/${cycleId}`, undefined, signal)
}

/** Throws ApiError 400 if no dates are sent or they break the deadline order. */
export function updateCycleDeadlines(cycleId: number, update: DeadlineUpdate, signal?: AbortSignal) {
  return apiPut<EvaluationCycle>(`/api/evaluation-cycles/${cycleId}/deadlines`, update, undefined, signal)
}

/** The deadline with this key; every cycle payload has all four. */
export function deadlineDate(cycle: EvaluationCycle, key: DeadlineKey) {
  return cycle.deadlines.find((d) => d.key === key)?.date ?? null
}

/** Today's campus date (ISO). There is no dedicated route; it comes with the current cycle. */
export async function getServerDate(signal?: AbortSignal) {
  return (await getCurrentEvaluationCycle(signal)).today
}
