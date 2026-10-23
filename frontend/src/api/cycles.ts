import { apiGet, apiPut } from './client'

export interface CycleDeadline {
  key: string
  label: string
  date: string
  is_open: boolean
  days_left: number
}

export interface EvaluationCycle {
  cycle_id: number
  term_id: number
  semester: string
  year: number
  today: string
  phase: string
  next_deadline: CycleDeadline | null
  deadlines: CycleDeadline[]
}

export function getCurrentCycle(signal?: AbortSignal) {
  return apiGet<EvaluationCycle>('/api/evaluation-cycles/current', undefined, signal)
}

export function updateCycleDeadlines(
  cycleId: number,
  body: Partial<Record<'signup' | 'observation' | 'post_observation_feedback' | 'app_feedback', string>>,
  signal?: AbortSignal,
) {
  return apiPut<EvaluationCycle>(`/api/evaluation-cycles/${cycleId}/deadlines`, body, signal)
}

export function deadlineDate(cycle: EvaluationCycle, key: string) {
  return cycle.deadlines.find((item) => item.key === key)?.date ?? ''
}
