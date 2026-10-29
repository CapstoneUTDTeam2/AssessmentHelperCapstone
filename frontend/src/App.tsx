import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import type { Role, User } from './auth/demoAccounts'
import { pickRandomThisTermInstructor } from './api/testHarness'
import AlertProvider from './components/AlertProvider'
import Sidebar from './components/Sidebar'
import SignupProvider from './components/SignupProvider'
import TesterBar from './components/TesterBar'
import CoursePage from './pages/CoursePage'
import DashboardPage from './pages/DashboardPage'
import EvaluationCriteriaPage from './pages/EvaluationCriteriaPage'
import EvaluationsPage from './pages/EvaluationsPage'
import FacultyPage from './pages/FacultyPage'
import LoginPage from './pages/LoginPage'
import MyProfilePage from './pages/MyProfilePage'
import ObservationReportPage from './pages/ObservationReportPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import TeacherDashboardPage from './pages/TeacherDashboardPage'
import TeacherEvaluationsPage from './pages/TeacherEvaluationsPage'
import TeacherSettingsPage from './pages/TeacherSettingsPage'
import type { PageProps } from './pageProps'

type AppRole = Exclude<Role, 'tester'>

const SESSION_KEY = 'assessment-helper-user'
const PAGE_KEY = 'assessment-helper-page'
const PARAM_KEY = 'assessment-helper-page-param'

// Sidebar items that have a page so far, per role; other items are ignored for now.
const PAGES: Record<AppRole, Record<string, ComponentType<PageProps>>> = {
  coordinator: {
    Dashboard: DashboardPage,
    Faculty: FacultyPage,
    Courses: CoursePage,
    Evaluations: EvaluationsPage,
    Reports: ReportsPage,
    'Evaluation Criteria': EvaluationCriteriaPage,
    Settings: SettingsPage,
    'Observation Report': ObservationReportPage,
  },
  faculty: {
    Dashboard: TeacherDashboardPage,
    'My Profile': MyProfilePage,
    Evaluations: TeacherEvaluationsPage,
    Settings: TeacherSettingsPage,
    'Observation Report': ObservationReportPage,
  },
}

// Pages opened from another page rather than the sidebar, and the sidebar item they belong under.
const PARENT_PAGES: Record<AppRole, Record<string, string>> = {
  coordinator: { 'Observation Report': 'Reports' },
  faculty: { 'Observation Report': 'Evaluations' },
}

function appRole(user: User): AppRole {
  return user.role === 'coordinator' ? 'coordinator' : 'faculty'
}

// Keeps the demo session across page refreshes (cleared when the tab closes).
function load(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // Storage unavailable; the session just won't survive a refresh.
  }
}

function loadUser(): User | null {
  const raw = load(SESSION_KEY)
  try {
    const parsed = raw ? (JSON.parse(raw) as User) : null
    if (!parsed) return null
    // Old tester sessions opened a console page. Tester is not a process role.
    if (parsed.role === 'tester') {
      return { ...parsed, role: 'faculty', title: parsed.title || 'Faculty', tester: true }
    }
    return parsed
  } catch {
    return null
  }
}

function loadPage(): string {
  return load(PAGE_KEY) ?? 'Dashboard'
}

function App() {
  const [user, setUser] = useState<User | null>(loadUser)
  const [page, setPage] = useState<string>(loadPage)
  const [param, setParam] = useState<string | null>(() => load(PARAM_KEY))
  const [reloadTick, setReloadTick] = useState(0)

  const handleLogin = (u: User) => {
    const role = appRole(u)
    const firstLogin = user == null
    save(SESSION_KEY, JSON.stringify(u))
    setUser(u)
    if (u.tester && firstLogin && role === 'faculty') {
      save(PAGE_KEY, 'Evaluations')
      setPage('Evaluations')
      return
    }
    if (!(page in PAGES[role])) {
      const landing = u.tester && role === 'faculty' ? 'Evaluations' : 'Dashboard'
      save(PAGE_KEY, landing)
      setPage(landing)
    }
  }

  useEffect(() => {
    if (!user?.tester || user.professorId != null) return
    const controller = new AbortController()
    pickRandomThisTermInstructor(controller.signal)
      .then((pick) => {
        handleLogin({
          ...user,
          role: 'faculty',
          name: pick?.professor_name ?? user.name,
          title: 'Faculty',
          professorId: pick?.professor_id ?? 1,
          tester: true,
        })
      })
      .catch(() => {
        handleLogin({
          ...user,
          role: 'faculty',
          title: 'Faculty',
          professorId: 1,
          tester: true,
        })
      })
    return () => controller.abort()
    // Pick once when a tester session has no professor yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tester, user?.professorId])

  const handleSignOut = () => {
    save(SESSION_KEY, null)
    save(PAGE_KEY, null)
    save(PARAM_KEY, null)
    setUser(null)
    setPage('Dashboard')
    setParam(null)
  }

  const handleNavigate = (item: string, nextParam?: string) => {
    if (!user || !(item in PAGES[appRole(user)])) return
    save(PAGE_KEY, item)
    save(PARAM_KEY, nextParam ?? null)
    setPage(item)
    setParam(nextParam ?? null)
    window.scrollTo(0, 0)
  }

  if (!user) return <LoginPage onLogin={handleLogin} />

  const role = appRole(user)
  const pages = PAGES[role]
  const fallback = user.tester ? 'Evaluations' : 'Dashboard'
  const current = page in pages ? page : fallback
  const Page = pages[current]
  return (
    <AlertProvider>
      <div className="flex min-h-screen bg-neutral-100 font-sans">
        <Sidebar
          user={user}
          active={PARENT_PAGES[role][current] ?? current}
          onNavigate={(item) => handleNavigate(item)}
          onSignOut={handleSignOut}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {user.tester && (
            <TesterBar
              user={user}
              onUser={handleLogin}
              onReload={() => setReloadTick((n) => n + 1)}
            />
          )}
          <SignupProvider key={`${user.role}-${user.professorId ?? 'none'}-${reloadTick}`}>
            <Page navigate={handleNavigate} param={param} user={user} onUser={handleLogin} />
          </SignupProvider>
        </div>
      </div>
    </AlertProvider>
  )
}

export default App
