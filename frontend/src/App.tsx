import { useState } from 'react'
import type { ComponentType } from 'react'
import type { Role, User } from './auth/demoAccounts'
import AlertProvider from './components/AlertProvider'
import Sidebar from './components/Sidebar'
import SignupProvider from './components/SignupProvider'
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

const SESSION_KEY = 'assessment-helper-user'
const PAGE_KEY = 'assessment-helper-page'
const PARAM_KEY = 'assessment-helper-page-param'

// Sidebar items that have a page so far, per role; other items are ignored for now.
const PAGES: Record<Role, Record<string, ComponentType<PageProps>>> = {
  coordinator: {
    Dashboard: DashboardPage,
    Faculty: FacultyPage,
    Courses: CoursePage,
    Evaluations: EvaluationsPage,
    Reports: ReportsPage,
    'Evaluation Criteria': EvaluationCriteriaPage,
    Settings: SettingsPage,
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
const PARENT_PAGES: Record<string, string> = {
  'Observation Report': 'Evaluations',
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
    return raw ? (JSON.parse(raw) as User) : null
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

  const handleLogin = (u: User) => {
    save(SESSION_KEY, JSON.stringify(u))
    setUser(u)
  }

  const handleSignOut = () => {
    save(SESSION_KEY, null)
    save(PAGE_KEY, null)
    save(PARAM_KEY, null)
    setUser(null)
    setPage('Dashboard')
    setParam(null)
  }

  const handleNavigate = (item: string, nextParam?: string) => {
    if (!user || !(item in PAGES[user.role])) return
    save(PAGE_KEY, item)
    save(PARAM_KEY, nextParam ?? null)
    setPage(item)
    setParam(nextParam ?? null)
    window.scrollTo(0, 0)
  }

  if (!user) return <LoginPage onLogin={handleLogin} />

  const pages = PAGES[user.role]
  const current = page in pages ? page : 'Dashboard'
  const Page = pages[current]
  return (
    <AlertProvider>
      <div className="flex min-h-screen bg-neutral-100 font-sans">
        <Sidebar
          user={user}
          active={PARENT_PAGES[current] ?? current}
          onNavigate={(item) => handleNavigate(item)}
          onSignOut={handleSignOut}
        />
        <SignupProvider>
          <Page navigate={handleNavigate} param={param} />
        </SignupProvider>
      </div>
    </AlertProvider>
  )
}

export default App
