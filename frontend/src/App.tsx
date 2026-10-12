import { useState } from 'react'
import type { ComponentType } from 'react'
import type { User } from './auth/demoAccounts'
import Sidebar from './components/Sidebar'
import CoursePage from './pages/CoursePage'
import DashboardPage from './pages/DashboardPage'
import EvaluationsPage from './pages/EvaluationsPage'
import FacultyPage from './pages/FacultyPage'
import LoginPage from './pages/LoginPage'
import ReportsPage from './pages/ReportsPage'

const SESSION_KEY = 'assessment-helper-user'
const PAGE_KEY = 'assessment-helper-page'

// Sidebar items that have a page so far; other items are ignored for now.
const PAGES: Record<string, ComponentType> = {
  Dashboard: DashboardPage,
  Faculty: FacultyPage,
  Courses: CoursePage,
  Evaluations: EvaluationsPage,
  Reports: ReportsPage,
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
  const page = load(PAGE_KEY)
  return page && page in PAGES ? page : 'Dashboard'
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
    if (!(item in PAGES)) return
    save(PAGE_KEY, item)
    setPage(item)
  }

  if (!user) return <LoginPage onLogin={handleLogin} />

  const Page = PAGES[page]
  return (
    <div className="flex min-h-screen bg-neutral-100 font-sans">
      <Sidebar user={user} active={page} onNavigate={handleNavigate} onSignOut={handleSignOut} />
      <Page />
    </div>
  )
}

export default App
