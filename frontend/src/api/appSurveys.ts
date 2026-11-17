// App improvement survey (backend/app/api/app_surveys.py). One per signed
// observation per role, open until the cycle's app feedback deadline.

import { apiGet, apiPost } from './client'
import type { SurveyRole } from './surveys'

export interface AppSurveyObservation {
  observation_id: number
  observation_date: string | null
  course_code: string
  section_name: string
  observee_name: string
  observer_name: string
}

export interface AppSurveyAnswers {
  app_response_id: number
  improvements: string | null
  enjoyments: string | null
  submitted_on: string | null
}

export interface ProfessorAppSurveys {
  professor_id: number
  cycle_id: number
  window: 'open' | 'closed'
  /** ISO date of the app feedback deadline. */
  due: string
  /** Only observations signed by both appear here. */
  surveys: (AppSurveyObservation & { role: SurveyRole; submitted: boolean; response: AppSurveyAnswers | null })[]
}

export interface AppSurveyResponses {
  cycle_id: number
  due: string
  response_count: number
  responses: (AppSurveyObservation & AppSurveyAnswers & { role: SurveyRole; professor_name: string })[]
  not_submitted: (AppSurveyObservation & { role: SurveyRole; professor_name: string })[]
}

export function getProfessorAppSurveys(professorId: number, signal?: AbortSignal) {
  return apiGet<ProfessorAppSurveys>(`/api/professors/${professorId}/app-surveys`, undefined, signal)
}

/** Throws ApiError 400 if the report isn't signed by both or the deadline passed, 409 if already sent. */
export function submitAppSurvey(
  body: { professor_id: number; observation_id: number; improvements?: string; enjoyments?: string },
  signal?: AbortSignal,
) {
  return apiPost<AppSurveyAnswers & { role: SurveyRole }>('/api/app-surveys', body, undefined, signal)
}

export function listAppSurveyResponses(signal?: AbortSignal) {
  return apiGet<AppSurveyResponses>('/api/app-surveys', undefined, signal)
}
