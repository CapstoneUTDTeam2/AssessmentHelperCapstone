import { useMemo, useState } from 'react'
import type { EvaluationRow, EvaluationStatus } from '../data/dashboardMock'

const STATUS_STYLES: Record<EvaluationStatus, string> = {
  Overdue: 'bg-[#b3261e]',
  'Report overdue': 'bg-[#b3261e]',
  Unmatched: 'bg-neutral-500',
  Pending: 'bg-[#e0791a]',
  Confirmed: 'bg-[#3f8a55]',
  Completed: 'bg-[#1c4532]',
}

type FilterKey = 'all' | 'overdue' | 'unmatched' | 'awaiting' | 'week'

const FILTERS: { key: FilterKey; label: string; match: (row: EvaluationRow) => boolean; showCount: boolean }[] = [
  { key: 'all', label: 'All', match: () => true, showCount: true },
  { key: 'overdue', label: 'Overdue', match: (r) => r.status === 'Overdue' || r.status === 'Report overdue', showCount: true },
  { key: 'unmatched', label: 'Unmatched', match: (r) => r.status === 'Unmatched', showCount: true },
  { key: 'awaiting', label: 'Awaiting report', match: (r) => r.status === 'Report overdue', showCount: true },
  { key: 'week', label: 'This week', match: () => false, showCount: false },
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

interface EvaluationsCardProps {
  rows?: EvaluationRow[]
  today?: string
}

function EvaluationsCard({ rows: evaluations = [], today = new Date().toISOString().slice(0, 10) }: EvaluationsCardProps) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'due', dir: 'asc' })
  const rows = useMemo(() => {
    const match =
      filter === 'week'
        ? (r: EvaluationRow) => isWithinDays(r.due, today, 7)
        : FILTERS.find((f) => f.key === filter)!.match
    const sorted = evaluations.filter(match).sort((a, b) => {
      const cmp = (a[sort.key] ?? '').localeCompare(b[sort.key] ?? '')
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return {
      outstanding: sorted.filter((r) => r.group === 'outstanding'),
      upcoming: sorted.filter((r) => r.group === 'upcoming'),
    }
  }, [evaluations, filter, sort, today])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Outstanding &amp; Upcoming Evaluations</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            Due and overdue faculty from the evaluation-status API · observers from this cycle’s observations
          </p>
        </div>
        <a href="#" className="shrink-0 text-[11px] text-[#e0791a] hover:underline" onClick={(e) => e.preventDefault()}>
          View all {evaluations.length} →
        </a>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter evaluations">
        {FILTERS.map((f) => {
          const match = f.key === 'week' ? (r: EvaluationRow) => isWithinDays(r.due, today, 7) : f.match
          const active = filter === f.key
          const count = evaluations.filter(match).length
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
                  {evaluations.length === 0 ? 'No faculty are due or overdue this cycle.' : 'No evaluations match this filter.'}
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

export default EvaluationsCard
