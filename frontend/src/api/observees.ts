// A professor's own sections and teaching history (backend/app/api/observee_classes.py).
// The current-term classes also serve as "My weekly schedule block" and
// "My sections available for sign-up" (both use the current cycle's term).

import { apiGet } from './client'

export interface ProfessorClass {
  course_id: number
  course_code: string
  course_name: string
  section_id: number
  section_name: string
  /** Day letters M, T, W, R, F (e.g. "TR"). */
  meeting_days: string | null
  /** "HH:MM". */
  start_time: string | null
  end_time: string | null
}

export interface CurrentClasses {
  professor_id: number
  professor_name: string
  semester: 'Spring' | 'Fall'
  year: number
  classes: ProfessorClass[]
}

export interface TeachingTerm {
  term_id: number
  semester: 'Spring' | 'Summer' | 'Fall'
  year: number
  /** Distinct course codes, in course-code order. */
  courses: string[]
  sections: number
  classes: ProfessorClass[]
}

export interface TeachingHistory {
  professor_id: number
  professor_name: string
  /** Newest term first. */
  terms: TeachingTerm[]
}

/** Sections the professor teaches this cycle. Throws ApiError 404 for an unknown professor. */
export function getCurrentClasses(professorId: number, signal?: AbortSignal) {
  return apiGet<CurrentClasses>(`/api/observees/${professorId}/classes`, undefined, signal)
}

/** Every term the professor has taught. Throws ApiError 404 for an unknown professor. */
export function getTeachingHistory(professorId: number, signal?: AbortSignal) {
  return apiGet<TeachingHistory>(`/api/observees/${professorId}/teaching-history`, undefined, signal)
}
