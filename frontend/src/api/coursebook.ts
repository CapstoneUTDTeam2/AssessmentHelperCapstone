import { apiPost } from './client'

export interface CourseBookImport {
  term: string
  prefix: string
  courses: number
  sections: number
  professors: number
  assignments: number
}

/** Pull CourseBook (Nebula Labs) into Courses, Sections, Professors, and TeachingAssignment. */
export function ingestCourseBook(
  query?: { prefix?: string; term?: string },
  signal?: AbortSignal,
) {
  return apiPost<CourseBookImport>('/api/coursebook/ingest', undefined, query, signal)
}