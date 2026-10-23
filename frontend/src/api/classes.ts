import { apiGet } from './client'

export interface ObserveeClass {
  course_id: number
  course_code: string
  course_name: string
  section_id: number
  section_name: string
  meeting_days: string
  start_time: string
  end_time: string
}

export interface ObserveeClassesResponse {
  professor_id: number
  professor_name: string
  semester: string
  year: number
  classes: ObserveeClass[]
}

export interface TeachingTerm {
  term_id: number
  semester: string
  year: number
  courses: string[]
  sections: number
  classes: ObserveeClass[]
}

export interface TeachingHistoryResponse {
  professor_id: number
  professor_name: string
  terms: TeachingTerm[]
}

export function getObserveeClasses(professorId: number, signal?: AbortSignal) {
  return apiGet<ObserveeClassesResponse>(`/api/observees/${professorId}/classes`, undefined, signal)
}

export function getTeachingHistory(professorId: number, signal?: AbortSignal) {
  return apiGet<TeachingHistoryResponse>(`/api/observees/${professorId}/teaching-history`, undefined, signal)
}
