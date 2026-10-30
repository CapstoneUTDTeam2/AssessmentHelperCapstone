import { useEffect, useState } from 'react'
import { committeeKpis, getCommitteeOverview, hireLevel, notifyObservees, startObserverSelection } from '../api/committee'
import type { CommitteeOverview } from '../api/committee'
import { ApiError } from '../api/client'
import type { UnmatchedFaculty } from '../api/kpis'
import type { ObserverAlert, SelectionSignup } from '../api/observerSelection'
import { notifySurvey } from '../api/surveys'
import DueMatchesCard from '../components/DueMatchesCard'
import EvaluationsCard from '../components/EvaluationsTable'
import type { HireLevel } from '../data/dashboardMock'
import type { PageProps } from '../pageProps'
import { KPI_ACCENTS } from '../theme'

// Phases (GET /api/evaluation-cycles/current) after the observation deadline, when the survey notice can go out.
const SURVEY_PHASES = ['post_observation_feedback', 'app_feedback', 'closed']

const HIRE_LEVEL_DOTS: Record<HireLevel, string> = {
  Assistant: 'bg-[#e0791a]',
  Associate: 'bg-[#c4561a]',
  Full: 'bg-[#1c4532]',
  Lecturer: 'bg-neutral-900',
}

function DashboardPage({ user }: PageProps) {
  const [data, setData] = useState<CommitteeOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ signups: SelectionSignup[]; alerts: ObserverAlert[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = () => {
    const controller = new AbortController()
    getCommitteeOverview(controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      })
    return () => controller.abort()
  }

  useEffect(() => {
    return load()
  }, [])

  const runSelection = async () => {
    setBusy('Selecting observers…')
    try {
      const result = await startObserverSelection()
      setSelection({ signups: result.signups, alerts: result.alerts ?? [] })
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Observer selection failed')
    } finally {
      setBusy(null)
    }
  }

  const notify = async (signupId?: number) => {
    setBusy('Sending notifications…')
    try {
      await notifyObservees(signupId)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notify failed')
    } finally {
      setBusy(null)
    }
  }

  const sendSurveyNotice = async () => {
    setBusy('Sending survey notice…')
    try {
      const result = await notifySurvey()
      setNotice(
        result.already_sent
          ? `Survey notice was already sent on ${result.sent_at.slice(0, 10)}.`
          : 'Survey notice sent to every observee and observer.',
      )
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Survey notice failed')
    } finally {
      setBusy(null)
    }
  }

  const term = data?.cycle ? `${data.cycle.semester} ${data.cycle.year}` : '—'
  const levelRows = countsByHireLevel(data)
  const kpis = committeeKpis(data)
  const surveyOpen = SURVEY_PHASES.includes(data?.cycle?.phase ?? '')

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluation Committee Dashboard</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {term} evaluation cycle · {data?.due.length ?? 0} due · {data?.overdue.length ?? 0} overdue ·{' '}
            {data?.noMatchCount ?? 0} unmatched
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={sendSurveyNotice}
            disabled={Boolean(busy) || !surveyOpen}
            title={surveyOpen ? undefined : 'Available after the observation deadline'}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            Send survey notice
          </button>
          <button
            type="button"
            onClick={runSelection}
            disabled={Boolean(busy)}
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-60"
          >
            {busy ?? 'Run Observer Selection'}
          </button>
        </div>
      </header>
      {error && <p className="mt-3 text-[11px] text-[#b3261e]">{error}</p>}
      {notice && <p className="mt-3 text-[11px] text-[#3f8a55]">{notice}</p>}
      {data && !data.kpis && (
        <p className="mt-3 text-[11px] text-neutral-500">
          KPIs are unavailable (GET /api/kpis failed), so only counts from the other endpoints are shown.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[264px_1fr]">
        <div className="flex flex-col gap-2.5">
          {kpis.map((kpi) => (
            <section
              key={kpi.label}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-4"
            >
              <span className={`h-6 w-0.5 shrink-0 rounded ${KPI_ACCENTS[kpi.accent]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[11px] text-neutral-600">{kpi.label}</h2>
                <p className={`text-[10px] ${kpi.detailPositive ? 'text-[#3f8a55]' : 'text-neutral-500'}`}>
                  {kpi.detail}
                </p>
              </div>
              <p className="text-xl font-semibold text-[#1c4532]">{kpi.value}</p>
            </section>
          ))}

          <HireLevelCard rows={levelRows} live={Boolean(data?.executive)} />
          {data?.executive && <UnmatchedReport faculty={data.executive.unmatched_faculty} />}
        </div>

        <div className="flex flex-col gap-4">
          <EvaluationsCard rows={data?.rows ?? []} today={data?.cycle?.today} />
          {user.tester && <DueMatchesCard />}
          <SelectionPanel
            signups={selection?.signups ?? data?.signups?.signups.map(toSelectionSignup) ?? []}
            alerts={selection?.alerts ?? data?.alerts ?? []}
            onNotifyAll={() => notify()}
            onNotifyOne={(id) => notify(id)}
          />
        </div>
      </div>
    </main>
  )
}

function toSelectionSignup(match: NonNullable<CommitteeOverview['signups']>['signups'][number]) {
  return {
    signup_id: match.signup_id ?? 0,
    professor_id: match.faculty_id,
    professor_name: match.faculty_name,
    course_code: match.course_code,
    course_name: match.course_name,
    section_id: match.section_id,
    section_name: '',
    status: match.insufficient ? 'Unmatched' : 'Matched',
    observers: match.observers,
    eligible_count: match.eligible_count,
  } satisfies SelectionSignup
}

type LevelRow = { level: HireLevel; due: number; overdue: number; outstanding: number }

function countsByHireLevel(data: CommitteeOverview | null): LevelRow[] {
  const rows = new Map<HireLevel, LevelRow>(
    (['Assistant', 'Associate', 'Full', 'Lecturer'] as HireLevel[]).map((level) => [
      level,
      { level, due: 0, overdue: 0, outstanding: 0 },
    ]),
  )
  const add = (counts: Record<string, number>, key: 'due' | 'overdue' | 'outstanding') => {
    for (const [level, n] of Object.entries(counts)) rows.get(hireLevel(level))![key] += n
  }
  if (data?.executive) {
    add(data.executive.faculty_due_by_hire_level, 'due')
    add(data.executive.faculty_overdue_by_hire_level, 'overdue')
    add(data.executive.outstanding_reports_by_hire_level, 'outstanding')
  } else {
    for (const p of data?.due ?? []) rows.get(hireLevel(p.current_level))!.due += 1
    for (const p of data?.overdue ?? []) rows.get(hireLevel(p.current_level))!.overdue += 1
  }
  return [...rows.values()]
}

function HireLevelCard({ rows, live }: { rows: LevelRow[]; live: boolean }) {
  const total = (key: 'due' | 'overdue' | 'outstanding') => rows.reduce((sum, row) => sum + row[key], 0)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">By Hire Level</h2>
      <p className="text-[10px] text-neutral-500">
        {live ? 'From GET /api/dashboard/executive' : 'From evaluation-status (executive dashboard unavailable)'}
      </p>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="bg-neutral-100 text-[10px] text-neutral-600">
            <th className="rounded-l px-2 py-1.5 text-left font-normal">Hire level</th>
            <th className="px-2 py-1.5 text-right font-normal">Due</th>
            <th className="px-2 py-1.5 text-right font-normal">Overdue</th>
            <th className="rounded-r px-2 py-1.5 text-right font-normal" title="Outstanding observation reports">
              Reports
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.level} className="border-b border-neutral-100">
              <td className="px-2 py-2 text-neutral-900">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${HIRE_LEVEL_DOTS[row.level]}`} aria-hidden="true" />
                  {row.level}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-neutral-900">{row.due}</td>
              <td className="px-2 py-2 text-right text-neutral-900">{row.overdue}</td>
              <td className="px-2 py-2 text-right text-neutral-900">{live ? row.outstanding : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-neutral-900">
            <td className="px-2 pt-2.5">Total</td>
            <td className="px-2 pt-2.5 text-right">{total('due')}</td>
            <td className="px-2 pt-2.5 text-right">{total('overdue')}</td>
            <td className="px-2 pt-2.5 text-right">{live ? total('outstanding') : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function UnmatchedReport({ faculty }: { faculty: UnmatchedFaculty[] }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Unmatched Faculty</h2>
      <p className="text-[10px] text-neutral-500">Signups with no observer yet, and why</p>
      <ul className="mt-3 space-y-1.5">
        {faculty.map((row) => (
          <li key={row.signup_id} className="rounded-md bg-neutral-50 px-3 py-2">
            <p className="text-[11px] font-semibold text-neutral-900">
              {row.professor_name} · {row.course_code}.{row.section_name}
            </p>
            <p className="text-[10px] text-neutral-500">
              {row.reason} · {row.eligible_count} eligible · {row.requests_sent} requested · {row.confirmed} confirmed
            </p>
          </li>
        ))}
        {faculty.length === 0 && (
          <li className="py-3 text-center text-[11px] text-neutral-500">Every signup has an observer.</li>
        )}
      </ul>
    </section>
  )
}

function SelectionPanel({
  signups,
  alerts,
  onNotifyAll,
  onNotifyOne,
}: {
  signups: SelectionSignup[]
  alerts: ObserverAlert[]
  onNotifyAll: () => void
  onNotifyOne: (signupId: number) => void
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Observer Selection</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            After the signup deadline: each observee, up to 5 observers, and a notify button. Manual assignment is a
            stretch goal.
          </p>
        </div>
        <button
          type="button"
          onClick={onNotifyAll}
          className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[10px] text-neutral-900 hover:bg-neutral-50"
        >
          Notify all observees
        </button>
      </div>

      {alerts.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {alerts.map((alert) => (
            <li
              key={`${alert.signup_id}-${alert.level}`}
              className={`rounded-md px-3 py-2 text-[11px] ${
                alert.level === 'none' ? 'bg-[#fde8e6] text-[#b3261e]' : 'bg-[#fdf1e6] text-[#c4561a]'
              }`}
            >
              {alert.message}
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 space-y-2">
        {signups.map((signup) => (
          <li key={signup.signup_id || signup.professor_id} className="rounded-md bg-neutral-50 px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-neutral-900">
                  {signup.professor_name} · {signup.course_code}
                  {signup.section_name ? `.${signup.section_name}` : ''}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {signup.observers.map((o) => o.name).join(', ') || 'No observers'} · {signup.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNotifyOne(signup.signup_id)}
                disabled={!signup.signup_id || signup.observers.length === 0}
                className="rounded-md bg-[#e0791a] px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
              >
                Notify observee
              </button>
            </div>
          </li>
        ))}
        {signups.length === 0 && (
          <li className="py-4 text-center text-[11px] text-neutral-500">No signups in this cycle yet.</li>
        )}
      </ul>
    </section>
  )
}

export default DashboardPage
