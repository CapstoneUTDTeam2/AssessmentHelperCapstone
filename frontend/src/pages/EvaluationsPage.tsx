import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getCommitteeOverview, hireLevel } from '../api/committee'
import type { CommitteeOverview } from '../api/committee'
import EvaluationsCard from '../components/EvaluationsTable'
import { MockDataBadge, MockDataNote } from '../components/MockData'
import type { HireLevel, Kpi } from '../data/dashboardMock'
import { KPIS } from '../data/dashboardMock'
import {
  CYCLE_COMPLETION,
  ELIGIBILITY,
  OBSERVER_WORKLOAD,
} from '../data/evaluationsMock'
import { KPI_ACCENTS } from '../theme'

type DisplayKpi = Kpi & { mock?: boolean }

function EvaluationsPage() {
  const [data, setData] = useState<CommitteeOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getCommitteeOverview(controller.signal)
      .then(setData)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load evaluations')
      })
    return () => controller.abort()
  }, [])

  const term = data?.cycle ? `${data.cycle.semester} ${data.cycle.year}` : '—'
  const due = data?.due.length ?? 0
  const overdue = data?.overdue.length ?? 0
  const unmatched = data?.noMatchCount ?? 0
  const signedUp = data?.signups?.signup_count
  const matches = data?.signups?.signups.reduce((sum, s) => sum + s.observers.length, 0)
  const kpis: DisplayKpi[] = [
    {
      label: 'Overdue Evaluations',
      detail: 'KPI 1.2',
      value: String(overdue),
      accent: overdue > 0 ? 'red' : 'green',
    },
    {
      label: 'Participation Rate',
      detail: signedUp === undefined ? 'KPI 2.1 · unavailable' : `KPI 2.1 · ${signedUp} / ${due} due`,
      value: due === 0 || signedUp === undefined ? '—' : `${Math.round((signedUp / due) * 100)}%`,
      accent: 'black',
    },
    {
      label: 'List sufficiency',
      detail: matches === undefined ? 'KPI 3a · unavailable' : `KPI 3a · ${matches} matches / ${signedUp} sign-ups`,
      value: signedUp && signedUp > 0 && matches !== undefined ? (matches / signedUp).toFixed(1) : '—',
      accent: 'green',
    },
    {
      label: 'Unmatched faculty',
      detail: 'No eligible observers',
      value: String(unmatched),
      accent: unmatched > 0 ? 'orange' : 'green',
    },
    {
      ...KPIS[0],
      mock: true,
      detail: 'KPI 1a · mock · no generator yet',
    },
  ]

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {term} cycle · {due} faculty due · {overdue} overdue · {unmatched} unmatched
          </p>
        </div>
      </header>
      {error && <p className="mt-3 text-[11px] text-[#b3261e]">{error}</p>}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <section key={kpi.label} className="rounded-lg border border-neutral-200 bg-white px-3.5 py-3.5">
            <span className={`block h-0.5 w-5 rounded ${KPI_ACCENTS[kpi.accent]}`} aria-hidden="true" />
            <h2 className="mt-2.5 flex items-center gap-1.5 text-[11px] text-neutral-600">
              {kpi.label}
              {kpi.mock && <MockDataBadge />}
            </h2>
            <p className="mt-1 text-2xl font-semibold text-[#1c4532]">{kpi.value}</p>
            <p className="mt-1 text-[10px] text-neutral-700">{kpi.detail}</p>
          </section>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_272px]">
        <EvaluationsCard rows={data?.rows ?? []} today={data?.cycle?.today} />
        <StatisticsCard data={data} />
      </div>
    </main>
  )
}

function StatisticsCard({ data }: { data: CommitteeOverview | null }) {
  const dueByLevel = countsByHireLevel(data?.due ?? [])

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Evaluation Statistics</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">Hire-level due counts from the API. Other charts are placeholders.</p>

      <StatSection title="Faculty due by hire level" meta="Executive dashboard">
        <ul className="space-y-2">
          {dueByLevel.map((row) => (
            <li key={row.level} className="flex justify-between text-[11px]">
              <span className="text-neutral-900">{row.level}</span>
              <span className="text-neutral-600">{row.count}</span>
            </li>
          ))}
        </ul>
      </StatSection>

      <StatSection title="Unmatched faculty" meta="Observer-selection alerts">
        <p className="text-2xl font-semibold text-[#1c4532]">{data?.noMatchCount ?? 0}</p>
        <ul className="mt-2 space-y-1 text-[10px] text-neutral-600">
          {(data?.alerts ?? []).map((alert) => (
            <li key={alert.signup_id}>{alert.message}</li>
          ))}
          {(data?.alerts.length ?? 0) === 0 && <li>No alerts this cycle.</li>}
        </ul>
      </StatSection>

      <StatSection title="Cycle completion" meta="Mock data">
        <MockDataNote>No completion API yet.</MockDataNote>
        <ul className="mt-2 space-y-1 text-[10px] text-neutral-600">
          {CYCLE_COMPLETION.map((row) => (
            <li key={row.segment} className="flex justify-between">
              <span>{row.segment}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      </StatSection>

      <StatSection title="Eligibility accuracy" meta="Mock data">
        <MockDataNote>KPI 1a is not generated yet.</MockDataNote>
        <p className="mt-1 text-[11px] text-neutral-700">
          {ELIGIBILITY.correct} correct · {ELIGIBILITY.flaggedEarly} flagged · {ELIGIBILITY.missed} missed
        </p>
      </StatSection>

      <StatSection title="Observer workload" meta="Mock data">
        <MockDataNote>No assignment-count API yet.</MockDataNote>
        <ul className="mt-2 space-y-1 text-[10px] text-neutral-600">
          {OBSERVER_WORKLOAD.map((row) => (
            <li key={row.assigned} className="flex justify-between">
              <span>{row.assigned} assigned</span>
              <span>{row.observers} observers</span>
            </li>
          ))}
        </ul>
      </StatSection>
    </section>
  )
}

function countsByHireLevel(professors: CommitteeOverview['due']) {
  const counts: Record<HireLevel, number> = { Assistant: 0, Associate: 0, Full: 0, Lecturer: 0 }
  for (const professor of professors) counts[hireLevel(professor.current_level)] += 1
  return (Object.entries(counts) as [HireLevel, number][]).map(([level, count]) => ({ level, count }))
}

function StatSection({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-neutral-900">{title}</h3>
        <span className="text-[9px] text-neutral-500">{meta}</span>
      </div>
      {children}
    </div>
  )
}

export default EvaluationsPage
