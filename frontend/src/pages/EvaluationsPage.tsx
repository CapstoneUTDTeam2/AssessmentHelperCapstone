import type { ReactNode } from 'react'
import EvaluationsCard from '../components/EvaluationsTable'
import { KPIS } from '../data/dashboardMock'
import {
  CYCLE_COMPLETION,
  CYCLE_SUMMARY,
  ELIGIBILITY,
  OBSERVER_WORKLOAD,
  PARTICIPATION,
  PARTICIPATION_TARGET,
} from '../data/evaluationsMock'
import type { CompletionSegment } from '../data/evaluationsMock'
import { KPI_ACCENTS } from '../theme'

const SEGMENT_COLORS: Record<CompletionSegment, string> = {
  Completed: 'bg-[#3f8a55]',
  Scheduled: 'bg-[#e0791a]',
  Overdue: 'bg-[#b3261e]',
  Unmatched: 'bg-neutral-500',
}

/** Bar color by observations per observer: idle, healthy, heavy, overloaded. */
const WORKLOAD_COLORS = ['bg-neutral-200', 'bg-[#13251c]', 'bg-[#1c4532]', 'bg-[#c4561a]', 'bg-[#b3261e]']

function EvaluationsPage() {
  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Fall 2026 cycle · {CYCLE_SUMMARY.facultyDue} faculty due · {CYCLE_SUMMARY.overdue} overdue ·{' '}
            {CYCLE_SUMMARY.unmatched} unmatched · Last synced 2 min ago
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Export Report
          </button>
          <button
            type="button"
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            + Schedule Evaluation
          </button>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {KPIS.map((kpi) => (
          <section key={kpi.label} className="rounded-lg border border-neutral-200 bg-white px-3.5 py-3.5">
            <span className={`block h-0.5 w-5 rounded ${KPI_ACCENTS[kpi.accent]}`} aria-hidden="true" />
            <h2 className="mt-2.5 text-[11px] text-neutral-600">{kpi.label}</h2>
            <p className="mt-1 text-2xl font-semibold text-[#1c4532]">{kpi.value}</p>
            <p className={`mt-1 text-[10px] ${kpi.detailPositive ? 'text-[#3f8a55]' : 'text-neutral-700'}`}>
              {kpi.detail}
            </p>
          </section>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_272px]">
        <EvaluationsCard showRemind />
        <StatisticsCard />
      </div>
    </main>
  )
}

function StatisticsCard() {
  const totalDue = CYCLE_COMPLETION.reduce((sum, s) => sum + s.count, 0)
  const completed = CYCLE_COMPLETION.find((s) => s.segment === 'Completed')!.count
  const decisions = ELIGIBILITY.correct + ELIGIBILITY.flaggedEarly + ELIGIBILITY.missed
  const observers = OBSERVER_WORKLOAD.reduce((sum, w) => sum + w.observers, 0)
  const maxObservers = Math.max(...OBSERVER_WORKLOAD.map((w) => w.observers))
  const unused = OBSERVER_WORKLOAD[0].observers
  const overloaded = OBSERVER_WORKLOAD[OBSERVER_WORKLOAD.length - 1].observers

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Evaluation Statistics</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">Fall 2026 cycle · breakdown behind the KPIs above</p>

      <StatSection title="Cycle completion" meta={`${totalDue} faculty due · KPI 1.2`}>
        <p className="text-neutral-900">
          <span className="text-2xl font-semibold">{completed}</span>{' '}
          <span className="text-[10px] text-neutral-500">
            of {totalDue} complete · {Math.round((completed / totalDue) * 100)}%
          </span>
        </p>
        <div className="mt-2 flex h-1.5 gap-0.5" role="img" aria-label="Cycle completion breakdown">
          {CYCLE_COMPLETION.map((s, i) => (
            <span
              key={s.segment}
              className={`h-full ${SEGMENT_COLORS[s.segment]} ${i === 0 ? 'rounded-l-full' : ''} ${
                i === CYCLE_COMPLETION.length - 1 ? 'rounded-r-full' : ''
              }`}
              style={{ width: `${(s.count / totalDue) * 100}%` }}
            />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-neutral-600">
          {CYCLE_COMPLETION.map((s) => (
            <li key={s.segment} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${SEGMENT_COLORS[s.segment]}`} aria-hidden="true" />
              {s.segment} {s.count}
            </li>
          ))}
        </ul>
      </StatSection>

      <StatSection title="Eligibility accuracy" meta={`${decisions} decisions · KPI 1.1`}>
        <div className="grid grid-cols-3 gap-1.5">
          <EligibilityTile label="Correct" value={ELIGIBILITY.correct} color="text-[#1c4532]" />
          <EligibilityTile label="Flagged early" value={ELIGIBILITY.flaggedEarly} color="text-[#e0791a]" />
          <EligibilityTile label="Missed" value={ELIGIBILITY.missed} color="text-[#b3261e]" />
        </div>
      </StatSection>

      <StatSection title="Participation by hire level" meta="KPI 2.1">
        <ul className="space-y-2">
          {PARTICIPATION.map((p) => {
            const share = p.participating / p.total
            return (
              <li key={p.level}>
                <div className="flex justify-between text-[10px]">
                  <span className="text-neutral-900">{p.level}</span>
                  <span className="text-neutral-600">
                    {p.participating} / {p.total} · {Math.round(share * 100)}%
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 rounded-full bg-neutral-200"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={p.total}
                  aria-valuenow={p.participating}
                  aria-label={`${p.level} participation`}
                >
                  <div
                    className={`h-1.5 rounded-full ${share < PARTICIPATION_TARGET ? 'bg-[#e0791a]' : 'bg-[#1c4532]'}`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </StatSection>

      <StatSection title="Observer workload" meta={`${observers} available · KPI 2.2 & 2.3`}>
        <div className="flex h-24 items-end gap-1.5" role="img" aria-label="Observers by number of assigned observations">
          {OBSERVER_WORKLOAD.map((w, i) => (
            <div key={w.assigned} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold text-neutral-900">{w.observers}</span>
              <span
                className={`w-full rounded-sm ${WORKLOAD_COLORS[i]}`}
                style={{ height: `${(w.observers / maxObservers) * 56}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5">
          {OBSERVER_WORKLOAD.map((w) => (
            <span key={w.assigned} className="flex-1 text-center text-[9px] text-neutral-500">
              {w.assigned}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[9px] text-neutral-500">
          per observer · {unused} unused · {overloaded} overloaded (4+)
        </p>
      </StatSection>
    </section>
  )
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

function EligibilityTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-md bg-neutral-100 px-2 py-1.5">
      <p className={`text-base font-semibold ${color}`}>{value}</p>
      <p className="text-[9px] text-neutral-500">{label}</p>
    </div>
  )
}

export default EvaluationsPage
