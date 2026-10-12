import { useMemo, useState } from 'react'
import {
  EVALUATIONS,
  HIRE_LEVEL_COUNTS,
  KPIS,
  MOCK_TODAY,
} from '../data/dashboardMock'
import type { EvaluationRow, EvaluationStatus, HireLevel, KpiAccent } from '../data/dashboardMock'

const KPI_ACCENTS: Record<KpiAccent, string> = {
  green: 'bg-[#1c4532]',
  red: 'bg-[#b3261e]',
  black: 'bg-neutral-900',
  orange: 'bg-[#e0791a]',
}

const STATUS_STYLES: Record<EvaluationStatus, string> = {
  Overdue: 'bg-[#b3261e]',
  'Report overdue': 'bg-[#b3261e]',
  Unmatched: 'bg-neutral-500',
  Pending: 'bg-[#e0791a]',
  Confirmed: 'bg-[#3f8a55]',
}

const HIRE_LEVEL_DOTS: Record<HireLevel, string> = {
  Assistant: 'bg-[#e0791a]',
  Associate: 'bg-[#c4561a]',
  Full: 'bg-[#1c4532]',
  Lecturer: 'bg-neutral-900',
}

type FilterKey = 'all' | 'overdue' | 'unmatched' | 'awaiting' | 'week'

const FILTERS: { key: FilterKey; label: string; match: (row: EvaluationRow) => boolean; showCount: boolean }[] = [
  { key: 'all', label: 'All', match: () => true, showCount: true },
  { key: 'overdue', label: 'Overdue', match: (r) => r.status === 'Overdue' || r.status === 'Report overdue', showCount: true },
  { key: 'unmatched', label: 'Unmatched', match: (r) => r.status === 'Unmatched', showCount: true },
  { key: 'awaiting', label: 'Awaiting report', match: (r) => r.status === 'Report overdue', showCount: true },
  { key: 'week', label: 'This week', match: (r) => isWithinDays(r.due, MOCK_TODAY, 7), showCount: false },
]

type SortKey = 'faculty' | 'level' | 'observer' | 'session' | 'due' | 'status'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'faculty', label: 'Faculty' },
  { key: 'level', label: 'Level' },
  { key: 'observer', label: 'Observer' },
  { key: 'session', label: 'Session' },
  { key: 'due', label: 'Due' },
  { key: 'status', label: 'Status' },
]

function isWithinDays(date: string, today: string, days: number) {
  const diff = (Date.parse(date) - Date.parse(today)) / 86_400_000
  return diff >= 0 && diff <= days
}

function formatDue(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DashboardPage() {
  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluation Committee Dashboard</h1>
          <p className="mt-1 text-xs text-neutral-500">Fall 2026 evaluation cycle · Last synced 2 min ago</p>
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
            + Run Observer Selection
          </button>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[264px_1fr]">
        <div className="flex flex-col gap-2.5">
          {KPIS.map((kpi) => (
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

          <HireLevelCard />
        </div>

        <EvaluationsCard />
      </div>
    </main>
  )
}

function HireLevelCard() {
  const total = HIRE_LEVEL_COUNTS.reduce((sum, row) => sum + row.count, 0)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Faculty Due by Hire Level</h2>
      <p className="text-[10px] text-neutral-500">Evaluation eligibility this cycle</p>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="bg-neutral-100 text-[10px] text-neutral-600">
            <th className="rounded-l px-2 py-1.5 text-left font-normal">Hire level</th>
            <th className="px-2 py-1.5 text-right font-normal">Faculty due</th>
            <th className="rounded-r px-2 py-1.5 text-right font-normal">Share</th>
          </tr>
        </thead>
        <tbody>
          {HIRE_LEVEL_COUNTS.map(({ level, count }) => (
            <tr key={level} className="border-b border-neutral-100">
              <td className="px-2 py-2 text-neutral-900">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${HIRE_LEVEL_DOTS[level]}`} aria-hidden="true" />
                  {level}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-neutral-900">{count}</td>
              <td className="px-2 py-2 text-right text-neutral-500">{Math.round((count / total) * 100)}%</td>
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

function EvaluationsCard() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' })

  const rows = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)!.match
    const sorted = EVALUATIONS.filter(match).sort((a, b) => {
      const cmp = (a[sort.key] ?? '').localeCompare(b[sort.key] ?? '')
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return {
      outstanding: sorted.filter((r) => r.group === 'outstanding'),
      upcoming: sorted.filter((r) => r.group === 'upcoming'),
    }
  }, [filter, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Outstanding &amp; Upcoming Evaluations</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            Overdue, unmatched, and awaiting-report items first · then sessions in the next 30 days
          </p>
        </div>
        <a href="#" className="shrink-0 text-[11px] text-[#e0791a] hover:underline" onClick={(e) => e.preventDefault()}>
          View all {EVALUATIONS.length} →
        </a>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter evaluations">
        {FILTERS.map((f) => {
          const active = filter === f.key
          const count = EVALUATIONS.filter(f.match).length
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-[10px] transition-colors ${
                active
                  ? 'border-[#1c4532] bg-[#1c4532] text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
              }`}
            >
              {f.label}
              {f.showCount && ` · ${count}`}
            </button>
          )
        })}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[11px]">
          <thead>
            <tr className="bg-neutral-100 text-[10px] text-neutral-600">
              {COLUMNS.map((col, i) => {
                const active = sort.key === col.key
                return (
                  <th
                    key={col.key}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`px-1.5 py-1.5 text-left font-normal ${i === 0 ? 'rounded-l' : ''} ${
                      i === COLUMNS.length - 1 ? 'rounded-r' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`flex w-full items-center gap-1 rounded bg-white px-1.5 py-0.5 ${
                        active ? 'font-medium text-neutral-900' : ''
                      }`}
                    >
                      {col.label}
                      <span className={active ? 'text-[#e0791a]' : ''} aria-hidden="true">
                        {active ? (sort.dir === 'asc' ? '↓' : '↑') : '↕'}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <GroupRows title="Outstanding" rows={rows.outstanding} />
            <GroupRows title="Upcoming · Next 30 days" rows={rows.upcoming} />
            {rows.outstanding.length + rows.upcoming.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-8 text-center text-neutral-500">
                  No evaluations match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GroupRows({ title, rows }: { title: string; rows: EvaluationRow[] }) {
  if (rows.length === 0) return null
  return (
    <>
      <tr>
        <th
          colSpan={COLUMNS.length}
          scope="rowgroup"
          className="px-1.5 pt-3 pb-1 text-left text-[9px] font-semibold tracking-wide text-neutral-500 uppercase"
        >
          {title} · {rows.length}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-neutral-100">
          <td className="px-1.5 py-2.5 font-medium text-neutral-900">{row.faculty}</td>
          <td className="px-1.5 py-2.5 text-neutral-700">{row.level}</td>
          <td className="px-1.5 py-2.5 text-neutral-700">
            {row.observer ?? <span style={{ color: '#b3261e' }}>— unmatched</span>}
          </td>
          <td className="px-1.5 py-2.5 text-neutral-700">{row.session}</td>
          <td className="px-1.5 py-2.5 text-neutral-700">{formatDue(row.due)}</td>
          <td className="px-1.5 py-2.5">
            <span
              className={`inline-block w-20 rounded-full py-0.5 text-center text-[9px] font-medium whitespace-nowrap text-white ${
                STATUS_STYLES[row.status]
              }`}
            >
              {row.status}
            </span>
          </td>
        </tr>
      ))}
    </>
  )
}

export default DashboardPage
