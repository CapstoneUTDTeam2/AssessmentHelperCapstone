// Course catalog for the current cycle's term (backend/app/api/course_catalog.py).

import { apiGet } from './client'

export interface Instructor {
  professor_id: number
  professor_name: string
}

export interface CatalogSection {
  section_id: number
  section_name: string
  /** Day letters M, T, W, R, F (e.g. "MW"). */
  meeting_days: string | null
  /** "HH:MM". */
  start_time: string | null
  end_time: string | null
  instructors: Instructor[]
}

export interface CatalogCourse {
  course_id: number
  course_code: string
  course_name: string
  course_description: string | null
  sections: CatalogSection[]
}

export interface CourseCatalog {
  semester: 'Spring' | 'Fall'
  year: number
  courses: CatalogCourse[]
}

export type CourseDetail = CatalogCourse & { semester: 'Spring' | 'Fall'; year: number }

export interface CourseSummary {
  term: string
  courseCount: number
  sectionCount: number
}

/** Every course, with this term's sections (a course may have none). */
export function listCourses(signal?: AbortSignal) {
  return apiGet<CourseCatalog>('/api/courses', undefined, signal)
}

/** One course. Throws ApiError 404 if not found. */
export function getCourse(courseId: number, signal?: AbortSignal) {
  return apiGet<CourseDetail>(`/api/courses/${courseId}`, undefined, signal)
}

export function summarizeCatalog(catalog: CourseCatalog): CourseSummary {
  return {
    term: `${catalog.semester} ${catalog.year}`,
    courseCount: catalog.courses.length,
    sectionCount: catalog.courses.reduce((sum, c) => sum + c.sections.length, 0),
  }
}

/** "Course summary": built from the catalog, since there is no summary route. */
export async function getCourseSummary(signal?: AbortSignal) {
  return summarizeCatalog(await listCourses(signal))
}
