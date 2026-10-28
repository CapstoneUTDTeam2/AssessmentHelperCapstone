import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getCourses } from '../api/courses'
import type { CatalogCourse } from '../api/courses'
import { authenticate, demoAccountFor } from '../auth/demoAccounts'
import type { Role, User } from '../auth/demoAccounts'

type FacultyChoice = { professor_id: number; professor_name: string }

function instructorsThisTerm(courses: CatalogCourse[]): FacultyChoice[] {
  const byId = new Map<number, string>()
  for (const course of courses) {
    for (const section of course.sections) {
      for (const instructor of section.instructors) {
        byId.set(instructor.professor_id, instructor.professor_name)
      }
    }
  }
  return [...byId.entries()]
    .map(([professor_id, professor_name]) => ({ professor_id, professor_name }))
    .sort((a, b) => a.professor_name.localeCompare(b.professor_name))
}

const ROLES: Record<Role, { label: string; description: string; viewName: string }> = {
  coordinator: {
    label: 'Assessment Coordinator',
    description: 'Manage eligibility, observer matching and committee reports.',
    viewName: 'Coordinator',
  },
  faculty: {
    label: 'Faculty',
    description: 'View your evaluation schedule, observations and feedback.',
    viewName: 'Faculty',
  },
}

interface LoginPageProps {
  onLogin: (user: User) => void
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [role, setRole] = useState<Role>('coordinator')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [faculty, setFaculty] = useState<FacultyChoice[]>([])
  const [professorId, setProfessorId] = useState<number | null>(null)
  const demo = demoAccountFor(role)
  const selectedFaculty = faculty.find((row) => row.professor_id === professorId) ?? faculty[0]

  useEffect(() => {
    if (role !== 'faculty') return
    const controller = new AbortController()
    getCourses(controller.signal)
      .then((body) => {
        const rows = instructorsThisTerm(body.courses)
        setFaculty(rows)
        setProfessorId((current) => {
          if (current && rows.some((row) => row.professor_id === current)) return current
          return rows.find((row) => row.professor_id !== 1)?.professor_id ?? rows[0]?.professor_id ?? 1
        })
      })
      .catch(() => {
        setFaculty([{ professor_id: 1, professor_name: 'Alice Johnson' }])
        setProfessorId(1)
      })
    return () => controller.abort()
  }, [role])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // TODO: replace the demo check with the auth API once the backend endpoint exists.
    const result = authenticate(email, password, role)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (role === 'faculty' && selectedFaculty) {
      onLogin({
        ...result.user,
        name: selectedFaculty.professor_name,
        professorId: selectedFaculty.professor_id,
      })
      return
    }
    onLogin(result.user)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 py-12">
      <div className="w-full max-w-[322px] rounded-2xl bg-white px-8 py-7 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <header>
          <h1 className="text-xl font-semibold text-neutral-900">Sign in</h1>
          <p className="mt-1 text-[13px] text-neutral-500">
            Welcome back. Choose your role to continue.
          </p>
        </header>

        <form className="mt-6" onSubmit={handleSubmit}>
          <fieldset>
            <legend className="text-xs text-neutral-800">Signing in as</legend>
            <div
              role="radiogroup"
              aria-label="Role"
              className="mt-1.5 grid grid-cols-2 rounded-lg bg-neutral-100 p-1"
            >
              {(Object.keys(ROLES) as Role[]).map((key) => {
                const selected = role === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setRole(key)
                      setError(null)
                    }}
                    className={`rounded-md px-2 py-1.5 text-[11px] transition-colors ${
                      selected
                        ? 'bg-white font-medium text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {ROLES[key].label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">{ROLES[role].description}</p>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="email" className="text-xs text-neutral-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#e0791a] focus:outline-none focus:ring-2 focus:ring-[#e0791a]/20"
            />
          </div>

          {role === 'faculty' && (
            <div className="mt-4">
              <label htmlFor="professor" className="text-xs text-neutral-800">
                View as professor
              </label>
              <select
                id="professor"
                value={selectedFaculty?.professor_id ?? 1}
                onChange={(e) => setProfessorId(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-[#e0791a] focus:outline-none focus:ring-2 focus:ring-[#e0791a]/20"
              >
                {faculty.length === 0 && <option value={1}>Loading this term’s instructors…</option>}
                {faculty.map((row) => (
                  <option key={row.professor_id} value={row.professor_id}>
                    {row.professor_name}
                    {row.professor_id === 1 ? ' (seed Alice Johnson)' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-neutral-500">
                Professors who teach this evaluation-cycle term. CourseBook names are anonymized; rank is
                unknown until the committee sets it.
              </p>
            </div>
          )}

          <div className="mt-4">
            <label htmlFor="password" className="text-xs text-neutral-800">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#e0791a] focus:outline-none focus:ring-2 focus:ring-[#e0791a]/20"
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-[#b3261e]">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#e0791a] px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            Sign in to {ROLES[role].viewName} view
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <div className="mt-5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-600">
          <p className="font-medium text-neutral-800">Demo login ({ROLES[role].label})</p>
          <p className="mt-1">
            Email: <code className="text-neutral-900">{demo.email}</code>
          </p>
          <p>
            Password: <code className="text-neutral-900">{demo.password}</code>
          </p>
          <button
            type="button"
            onClick={() => {
              setEmail(demo.email)
              setPassword(demo.password)
              setError(null)
            }}
            className="mt-1.5 text-[#e0791a] hover:underline"
          >
            Fill in demo login
          </button>
        </div>
      </div>
    </main>
  )
}

export default LoginPage
