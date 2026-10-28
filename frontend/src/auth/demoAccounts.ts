// Frontend-only demo login, used when POST /api/auth/login can't be reached or
// the seed database has no password for these demo emails. Sessions made here
// are flagged `demo` so the UI can label them Mock data.

export type Role = 'coordinator' | 'faculty'

export interface User {
  email: string
  name: string
  title: string
  role: Role
  /** Professors.ProfessorID the session loads. Demo coordinator sessions omit this. */
  professorId?: number
  /** True when signed in with a hard-coded demo account instead of the auth API. */
  demo?: boolean
}

interface DemoAccount extends User {
  password: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'coordinator@example.com',
    password: 'demo1234',
    name: 'AC Member',
    title: 'Committee Chair',
    role: 'coordinator',
  },
  {
    email: 'professor.a@example.com',
    password: 'faculty1234',
    name: 'Alice Johnson',
    title: 'Faculty',
    role: 'faculty',
    professorId: 1,
  },
]

/** The demo account shown on the login screen for each role. */
export function demoAccountFor(role: Role): DemoAccount {
  return DEMO_ACCOUNTS.find((a) => a.role === role)!
}

export function isDemoEmail(email: string) {
  return DEMO_ACCOUNTS.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())
}

export type AuthResult ={ ok: true; user: User } | { ok: false; error: string }

export function authenticate(email: string, password: string, role: Role): AuthResult {
  const account = DEMO_ACCOUNTS.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password,
  )
  if (!account) {
    return { ok: false, error: 'Incorrect email or password.' }
  }
  if (account.role !== role) {
    return {
      ok: false,
      error:
        role === 'faculty'
          ? 'This is an Assessment Coordinator account. Switch the role above to continue.'
          : 'This account does not have Assessment Coordinator access.',
    }
  }
  const { email: userEmail, name, title, role: userRole, professorId } = account
  return { ok: true, user: { email: userEmail, name, title, role: userRole, professorId, demo: true } }
}
