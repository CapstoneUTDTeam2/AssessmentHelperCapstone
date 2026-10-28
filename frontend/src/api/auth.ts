// Login against Professors.Email / pass_hash (backend/app/api/auth.py).

import { apiPost } from './client'

export interface LoggedInProfessor {
  professor_id: number
  name: string
  email: string
  current_level: string | null
  department_id: number
  department_name: string
  /** True for Assessment Committee members (Professors.isAC). */
  is_ac: boolean
}

/** Throws ApiError 401 for a wrong email or password, 409 if two accounts share the email. */
export function login(email: string, password: string, signal?: AbortSignal) {
  return apiPost<LoggedInProfessor>('/api/auth/login', { email, password }, undefined, signal)
}
