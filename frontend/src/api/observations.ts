// Observation reports: the form, ratings, and signatures (backend/app/api/observations.py).

import { apiGet, apiPost, apiPut } from './client'

export interface RatingOption {
  value: number
  label: string
}

/** Rating value the backend uses for Not Applicable. */
export const NOT_APPLICABLE = 6

export interface ObservationSummary {
  observation_id: number
  signup_id: number
  cycle_id: number
  semester: string
  year: number
  /** "Scheduled" or "Completed". */
  status: string
  /** ISO date: the observation date, or the scheduled date until it happens. */
  observation_date: string | null
  start_time: string | null
  end_time: string | null
  observee_id: number
  observee_name: string
  observee_level: string | null
  observer_id: number
  observer_name: string
  course_code: string
  course_name: string
  section_id: number
  section_name: string
  meeting_days: string | null
  template_id: number
  template_version: string
  observer_signed: boolean
  observee_signed: boolean
  /** True once both signed; the database rejects further changes. */
  locked: boolean
  completed_at: string | null
}

export interface ObservationCriterion {
  criterion_id: number
  name: string
  description: string | null
  section_id: number | null
  bullets: string[]
  is_required: boolean
  /** A rating of 1 or 2 needs a comment. */
  notes_on_low_rating: boolean
  rating: number | null
  not_applicable: boolean
  comment: string | null
}

export interface ObservationReport extends ObservationSummary {
  summary: string | null
  rating_scale: RatingOption[]
  criteria: ObservationCriterion[]
  ready_to_sign: boolean
  /** Why it can't be signed yet, e.g. "Clarity needs a rating". */
  missing: string[]
}

export type ProfessorObservation = ObservationSummary & { needs_my_signature: boolean }

export interface ProfessorObservations {
  professor_id: number
  received: ProfessorObservation[]
  given: ProfessorObservation[]
}

export interface RatingEntry {
  criterion_id: number
  rating: number | null
  comment?: string | null
}

export function listObservations(query?: { cycle_id?: number; status?: string }, signal?: AbortSignal) {
  return apiGet<{ cycle_id: number; completed_count: number; observations: ObservationSummary[] }>(
    '/api/observations',
    query,
    signal,
  )
}

export function getObservation(observationId: number, signal?: AbortSignal) {
  return apiGet<ObservationReport>(`/api/observations/${observationId}`, undefined, signal)
}

export function getProfessorObservations(professorId: number, signal?: AbortSignal) {
  return apiGet<ProfessorObservations>(`/api/professors/${professorId}/observations`, undefined, signal)
}

/** Observer only. Throws ApiError 409 once anyone has signed. */
export function saveRatings(
  observationId: number,
  body: { observer_id: number; ratings: RatingEntry[]; summary?: string | null },
  signal?: AbortSignal,
) {
  return apiPut<ObservationReport>(`/api/observations/${observationId}/ratings`, body, undefined, signal)
}

/** Observer or observee. Throws ApiError 400 before the date or while `missing` isn't empty. */
export function signObservation(observationId: number, professorId: number, signal?: AbortSignal) {
  return apiPost<ObservationReport>(
    `/api/observations/${observationId}/sign`,
    { professor_id: professorId },
    undefined,
    signal,
  )
}
