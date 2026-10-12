// Frontend-only demo login. These accounts are hard-coded and checked in the
// browser so the UI can be clicked through before the auth API exists.
// Replace `authenticate` with a real API call once the backend supports it.

export type Role = 'coordinator' | 'faculty'

export interface User {
  email: string
  name: string
  title: string
  role: Role
}

interface DemoAccount extends User {
  password: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'coordinator@utdallas.edu',
    password: 'demo1234',
    name: 'AC Member',
    title: 'Committee Chair',
    role: 'coordinator',
  },
]

export type AuthResult = { ok: true; user: User } | { ok: false; error: string }

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
  const { email: userEmail, name, title, role: userRole } = account
  return { ok: true, user: { email: userEmail, name, title, role: userRole } }
}
