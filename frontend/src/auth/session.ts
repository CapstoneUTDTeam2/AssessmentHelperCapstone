import type { User } from './demoAccounts'

const SESSION_KEY = 'assessment-helper-user'

/** Seed Alice Johnson. Used only when a faculty session has no professorId. */
export const DEMO_PROFESSOR_ID = 1

export function loggedInUser(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

/** Faculty demo account professor id, or null for an AC session. */
export function loggedInProfessorId(): number | null {
  return loggedInUser()?.professorId ?? null
}
