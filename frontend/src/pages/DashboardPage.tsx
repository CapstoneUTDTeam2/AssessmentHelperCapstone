import { useEffect, useState } from 'react'
import { getCommitteeOverview, hireLevel, notifyObservees, startObserverSelection } from '../api/committee'
import type { CommitteeOverview } from '../api/committee'
import { ApiError } from '../api/client'
import type { ObserverAlert, SelectionSignup } from '../api/observerSelection'
import EvaluationsCard from '../components/EvaluationsTable'
import { MockDataBadge } from '../components/MockData'
import type { HireLevel, Kpi } from '../data/dashboardMock'
import { KPIS } from '../data/dashboardMock'
import { KPI_ACCENTS } from '../theme'

type DisplayKpi = Kpi & { mock?: boolean }

const HIRE_LEVEL_DOTS: Record<HireLevel, string> = {
  Assistant: 'bg-[#e0791a]',
  Associate: 'bg-[#c4561a]',
  Full: 'bg-[#1c4532]',
  Lecturer: 'bg-neutral-900',
}

function DashboardPage() {
  const [data, setData] = useState<CommitteeOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ signups: SelectionSignup[]; alerts: ObserverAlert[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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

  const term = data?.cycle ? `${data.cycle.semester} ${data.cycle.year}` : '—'
  const dueByLevel = countsByHireLevel(data?.due ?? [])
  const kpis = processKpis(data)

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
            onClick={runSelection}
            disabled={Boolean(busy)}
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-60"
          >
            {busy ?? 'Run Observer Selection'}
          </button>
        </div>
      </header>
      {error && <p className="mt-3 text-[11px] text-[#b3261e]">{error}</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[264px_1fr]">
        <div className="flex flex-col gap-2.5">
          {kpis.map((kpi) => (
            <section
              key={kpi.label}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-4"
            >
              <span className={`h-6 w-0.5 shrink-0 rounded ${KPI_ACCENTS[kpi.accent]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-1.5 text-[11px] text-neutral-600">
                  {kpi.label}
                  {kpi.mock && <MockDataBadge />}
                </h2>
                <p className={`text-[10px] ${kpi.detailPositive ? 'text-[#3f8a55]' : 'text-neutral-500'}`}>
                  {kpi.detail}
                </p>
              </div>
              <p className="text-xl font-semibold text-[#1c4532]">{kpi.value}</p>
            </section>
          ))}

          <HireLevelCard counts={dueByLevel} />
        </div>

        <div className="flex flex-col gap-4">
          <EvaluationsCard rows={data?.rows ?? []} today={data?.cycle?.today} />
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

function processKpis(data: CommitteeOverview | null): DisplayKpi[] {
  const due = data?.due.length ?? 0
  const overdue = data?.overdue.length ?? 0
  const signedUp = data?.signups?.signup_count
  const insufficient = data?.signups?.insufficient_count
  const matches = data?.signups?.signups.reduce((sum, s) => sum + s.observers.length, 0)
  const listRate =
    signedUp && signedUp > 0 && matches !== undefined ? (matches / signedUp).toFixed(1) : '—'
  return [
    {
      label: 'Overdue Evaluations',
      detail: 'KPI 1.2 · from evaluation-status',
      value: String(overdue),
      accent: overdue > 0 ? 'red' : 'green',
    },
    {
      label: 'Participation Rate',
      detail:
        signedUp === undefined
          ? 'KPI 2.1 · signups / due · unavailable'
          : `KPI 2.1 · ${signedUp} signed up / ${due} due`,
      value: due === 0 || signedUp === undefined ? '—' : `${Math.round((signedUp / due) * 100)}%`,
      accent: 'black',
      detailPositive: due > 0 && signedUp !== undefined && signedUp / due >= 0.75,
    },
    {
      label: 'List sufficiency',
      detail:
        matches === undefined
          ? 'KPI 3a · avg matches / sign-ups · unavailable'
          : `KPI 3a · ${matches} matches / ${signedUp} sign-ups${insufficient ? ` · ${insufficient} short` : ''}`,
      value: listRate,
      accent: 'green',
    },
    {
      label: 'Unmatched faculty',
      detail: 'No eligible observers · AC alert',
      value: String(data?.noMatchCount ?? 0),
      accent: (data?.noMatchCount ?? 0) > 0 ? 'orange' : 'green',
    },
    {
      ...KPIS[0],
      mock: true,
      detail: 'KPI 1a · mock · no generator yet',
    },
    {
      ...KPIS[3],
      mock: true,
      detail: 'KPI 2.2 · mock · no generator yet',
    },
  ]
}

function countsByHireLevel(professors: CommitteeOverview['due']) {
  const counts: Record<HireLevel, number> = { Assistant: 0, Associate: 0, Full: 0, Lecturer: 0 }
  for (const professor of professors) counts[hireLevel(professor.current_level)] += 1
  return (Object.entries(counts) as [HireLevel, number][]).map(([level, count]) => ({ level, count }))
}

function HireLevelCard({ counts }: { counts: { level: HireLevel; count: number }[] }) {
  const total = counts.reduce((sum, row) => sum + row.count, 0)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Faculty Due by Hire Level</h2>
      <p className="text-[10px] text-neutral-500">From GET /api/evaluation-status/due</p>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="bg-neutral-100 text-[10px] text-neutral-600">
            <th className="rounded-l px-2 py-1.5 text-left font-normal">Hire level</th>
            <th className="px-2 py-1.5 text-right font-normal">Faculty due</th>
            <th className="rounded-r px-2 py-1.5 text-right font-normal">Share</th>
          </tr>
        </thead>
        <tbody>
          {counts.map(({ level, count }) => (
            <tr key={level} className="border-b border-neutral-100">
              <td className="px-2 py-2 text-neutral-900">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${HIRE_LEVEL_DOTS[level]}`} aria-hidden="true" />
                  {level}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-neutral-900">{count}</td>
              <td className="px-2 py-2 text-right text-neutral-500">
                {total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-neutral-900">
            <td className="px-2 pt-2.5">Total</td>
            <td className="px-2 pt-2.5 text-right">{total}</td>
            <td className="px-2 pt-2.5 text-right font-normal text-neutral-500">100%</td>
          </tr>
        </tfoot>
      </table>
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
