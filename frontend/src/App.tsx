import { useState } from 'react'
import type { ComponentType } from 'react'
import type { Role, User } from './auth/demoAccounts'
import Sidebar from './components/Sidebar'
import CoursePage from './pages/CoursePage'
import DashboardPage from './pages/DashboardPage'
import EvaluationCriteriaPage from './pages/EvaluationCriteriaPage'
import EvaluationsPage from './pages/EvaluationsPage'
import FacultyPage from './pages/FacultyPage'
import LoginPage from './pages/LoginPage'
import MyProfilePage from './pages/MyProfilePage'
import ReportsPage from './pages/ReportsPage'
import TeacherDashboardPage from './pages/TeacherDashboardPage'

const SESSION_KEY = 'assessment-helper-user'
const PAGE_KEY = 'assessment-helper-page'

// Sidebar items that have a page so far, per role; other items are ignored for now.
const PAGES: Record<Role, Record<string, ComponentType>> = {
  coordinator: {
    Dashboard: DashboardPage,
    Faculty: FacultyPage,
    Courses: CoursePage,
    Evaluations: EvaluationsPage,
    Reports: ReportsPage,
    'Evaluation Criteria': EvaluationCriteriaPage,
  },
  faculty: {
    Dashboard: TeacherDashboardPage,
    'My Profile': MyProfilePage,
  },
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

  const handleLogin = (u: User) => {
    save(SESSION_KEY, JSON.stringify(u))
    setUser(u)
  }

  const handleSignOut = () => {
    save(SESSION_KEY, null)
    save(PAGE_KEY, null)
    setUser(null)
    setPage('Dashboard')
  }

  const handleNavigate = (item: string) => {
    if (!user || !(item in PAGES[user.role])) return
    save(PAGE_KEY, item)
    setPage(item)
  }

  if (!user) return <LoginPage onLogin={handleLogin} />

  const pages = PAGES[user.role]
  const current = page in pages ? page : 'Dashboard'
  const Page = pages[current]
  return (
    <div className="flex min-h-screen bg-neutral-100 font-sans">
      <Sidebar user={user} active={current} onNavigate={handleNavigate} onSignOut={handleSignOut} />
      <Page />
    </div>
  )
}

export default App
