import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { committeeKpis, getCommitteeOverview, hireLevel } from '../api/committee'
import type { CommitteeOverview } from '../api/committee'
import EvaluationsCard from '../components/EvaluationsTable'
import type { EvaluationStatus, HireLevel } from '../data/dashboardMock'
import { KPI_ACCENTS } from '../theme'

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
  const kpis = committeeKpis(data)

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

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <section key={kpi.label} className="rounded-lg border border-neutral-200 bg-white px-3.5 py-3.5">
            <span className={`block h-0.5 w-5 rounded ${KPI_ACCENTS[kpi.accent]}`} aria-hidden="true" />
            <h2 className="mt-2.5 text-[11px] text-neutral-600">{kpi.label}</h2>
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

const COMPLETION: { label: string; statuses: EvaluationStatus[] }[] = [
  { label: 'Completed', statuses: ['Completed'] },
  { label: 'Scheduled', statuses: ['Confirmed'] },
  { label: 'Report overdue', statuses: ['Report overdue'] },
  { label: 'No observer yet', statuses: ['Pending', 'Overdue'] },
  { label: 'Unmatched', statuses: ['Unmatched'] },
]

function StatisticsCard({ data }: { data: CommitteeOverview | null }) {
  const dueByLevel = countsByHireLevel(data)
  const rows = data?.rows ?? []
  const accuracy = data?.kpis?.evaluation_eligibility_accuracy
  const workload = observerWorkload(data)

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Evaluation Statistics</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">This cycle, from the KPI, executive dashboard and observations APIs.</p>

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

      <StatSection title="Cycle completion" meta="Due and overdue faculty">
        <ul className="space-y-1 text-[10px] text-neutral-600">
          {COMPLETION.map((segment) => (
            <li key={segment.label} className="flex justify-between">
              <span>{segment.label}</span>
              <span>{rows.filter((r) => segment.statuses.includes(r.status)).length}</span>
            </li>
          ))}
        </ul>
      </StatSection>

      <StatSection title="Eligibility accuracy" meta="KPI 1.1">
        {accuracy ? (
          <>
            <p className="text-[11px] text-neutral-700">
              {accuracy.correct_matches} of {accuracy.total_matches} saved matches correct
            </p>
            <ul className="mt-1 space-y-1 text-[10px] text-[#b3261e]">
              {accuracy.incorrect.map((m) => (
                <li key={`${m.signup_id}-${m.observer_id}`}>
                  Signup {m.signup_id}, observer {m.observer_id}: {m.reasons.join(', ')}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[11px] text-neutral-500">Unavailable</p>
        )}
      </StatSection>

      <StatSection title="Observer workload" meta="Observations per observer">
        <ul className="space-y-1 text-[10px] text-neutral-600">
          {workload.map((row) => (
            <li key={row.assigned} className="flex justify-between">
              <span>{row.assigned} assigned</span>
              <span>
                {row.observers} observer{row.observers === 1 ? '' : 's'}
              </span>
            </li>
          ))}
          {workload.length === 0 && <li>No observations scheduled yet.</li>}
        </ul>
      </StatSection>
    </section>
  )
}

function countsByHireLevel(data: CommitteeOverview | null) {
  const counts: Record<HireLevel, number> = { Assistant: 0, Associate: 0, Full: 0, Lecturer: 0 }
  if (data?.executive) {
    for (const [level, n] of Object.entries(data.executive.faculty_due_by_hire_level)) counts[hireLevel(level)] += n
  } else {
    for (const professor of data?.due ?? []) counts[hireLevel(professor.current_level)] += 1
  }
  return (Object.entries(counts) as [HireLevel, number][]).map(([level, count]) => ({ level, count }))
}

/** How many observers have 1, 2, 3 or 4+ observations this cycle. */
function observerWorkload(data: CommitteeOverview | null) {
  const perObserver = new Map<number, number>()
  for (const o of data?.observations ?? []) perObserver.set(o.observer_id, (perObserver.get(o.observer_id) ?? 0) + 1)
  const buckets = new Map<string, number>()
  for (const n of perObserver.values()) {
    const key = n >= 4 ? '4+' : String(n)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return ['1', '2', '3', '4+'].filter((k) => buckets.has(k)).map((assigned) => ({ assigned, observers: buckets.get(assigned)! }))
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
