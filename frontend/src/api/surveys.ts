// Post-observation survey (backend/app/api/surveys.py). Opens after the
// observation deadline and closes at the post-observation feedback deadline.

import { apiGet, apiPost } from './client'

export type SurveyRole = 'Observee' | 'Observer'

export interface SurveyResponse {
  survey_response_id: number
  role: SurveyRole
  submitted_at: string | null
  process_ok: boolean | null
  difficulties: string | null
  improvements: string | null
}

export interface ProfessorSurveys {
  professor_id: number
  cycle_id: number
  window: 'not_open_yet' | 'open' | 'closed'
  /** ISO date; the survey opens the day after. */
  opens_after: string
  /** ISO date of the post-observation feedback deadline. */
  due: string
  committee_notified: boolean
  /** One entry per role the professor had this cycle. */
  surveys: { role: SurveyRole; signup_id: number; submitted: boolean; response: SurveyResponse | null }[]
}

export interface SurveyAnswers {
  professor_id: number
  role: SurveyRole
  process_ok: boolean
  difficulties?: string
  improvements?: string
}

export interface SurveyResponses {
  cycle_id: number
  committee_notified_at: string | null
  response_count: number
  responses: (SurveyResponse & { professor_id: number; professor_name: string; signup_id: number })[]
  not_submitted: { professor_id: number; role: SurveyRole }[]
}

export function getProfessorSurveys(professorId: number, signal?: AbortSignal) {
  return apiGet<ProfessorSurveys>(`/api/professors/${professorId}/surveys`, undefined, signal)
}

/** Throws ApiError 400 outside the window or for a role they didn't have, 409 if already submitted. */
export function submitSurvey(answers: SurveyAnswers, signal?: AbortSignal) {
  return apiPost<SurveyResponse & { professor_id: number; cycle_id: number }>('/api/surveys', answers, undefined, signal)
}

export function listSurveyResponses(signal?: AbortSignal) {
  return apiGet<SurveyResponses>('/api/surveys', undefined, signal)
}

/** Committee only. Throws ApiError 400 before the observation deadline passes. */
export function notifySurvey(signal?: AbortSignal) {
  return apiPost<{ cycle_id: number; already_sent: boolean; sent_at: string }>(
    '/api/surveys/notify',
    undefined,
    undefined,
    signal,
  )
}
