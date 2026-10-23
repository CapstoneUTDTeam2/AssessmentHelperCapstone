import { apiGet } from './client'

export interface CourseInstructor {
  professor_id: number
  professor_name: string
}

export interface CourseSection {
  section_id: number
  section_name: string
  meeting_days: string
  start_time: string
  end_time: string
  instructors: CourseInstructor[]
}

export interface CatalogCourse {
  course_id: number
  course_code: string
  course_name: string
  course_description: string
  sections: CourseSection[]
}

export interface CourseCatalog {
  semester: string
  year: number
  courses: CatalogCourse[]
}

export function getCourses(signal?: AbortSignal) {
  return apiGet<CourseCatalog>('/api/courses', undefined, signal)
}
