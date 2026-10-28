import { useEffect, useMemo, useState } from 'react'
import { getReports } from '../api/reports'
import type { ReportRow, ReportStatus } from '../api/reports'
import type { EvaluationCycle } from '../api/cycles'
import type { FacultyLevel } from '../data/facultyMock'
import type { PageProps } from '../pageProps'
import { downloadCsv } from '../utils/csv'

const PAGE_SIZE = 12

const AVATAR_COLORS: Record<ReportRow['avatar'], string> = {
  orange: 'bg-[#e0791a]',
  green: 'bg-[#1c4532]',
}

const LEVEL_BADGES: Record<FacultyLevel, string> = {
  'Assistant Prof.': 'bg-[#e0791a]',
  'Associate Prof.': 'bg-[#1c4532]',
  'Full Prof.': 'bg-[#13251c]',
  Lecturer: 'bg-[#c4561a]',
}

const STATUS_PILLS: Record<ReportStatus, string> = {
  Scheduled: 'bg-[#1c4532]',
  'Awaiting sign-off': 'bg-[#e0791a]',
  'Signed off': 'bg-[#3f8a55]',
  'Report overdue': 'bg-[#b3261e]',
  'No report': 'bg-neutral-500',
}

type FilterKey = 'all' | 'scheduled' | 'awaiting' | 'signed' | 'overdue'

const FILTERS: { key: FilterKey; label: string; match: (r: ReportRow) => boolean }[] = [
  { key: 'all', label: 'All reports', match: () => true },
  { key: 'scheduled', label: 'Scheduled', match: (r) => r.status === 'Scheduled' },
  { key: 'awaiting', label: 'Awaiting sign-off', match: (r) => r.status === 'Awaiting sign-off' },
  { key: 'signed', label: 'Signed off', match: (r) => r.status === 'Signed off' },
  { key: 'overdue', label: 'Report overdue', match: (r) => r.status === 'Report overdue' },
]

type SortKey = 'professor' | 'level' | 'date' | 'status'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

/** Observations first, then faculty with no observer. */
const DATE_RANK: Record<ReportStatus, number> = {
  Scheduled: 0,
  'Awaiting sign-off': 0,
  'Signed off': 0,
  'Report overdue': 0,
  'No report': 1,
}

function compare(a: ReportRow, b: ReportRow, { key, dir }: Sort) {
  const flip = dir === 'asc' ? 1 : -1
  if (key === 'date') {
    // Rank stays fixed so missing reports always sit at the bottom.
    return DATE_RANK[a.status] - DATE_RANK[b.status] || flip * (a.date ?? '').localeCompare(b.date ?? '')
  }
  return flip * (a[key] ?? '').localeCompare(b[key] ?? '')
}

const SORT_PRESETS: { label: string; sort: Sort }[] = [
  { label: 'Newest first', sort: { key: 'date', dir: 'desc' } },
  { label: 'Oldest first', sort: { key: 'date', dir: 'asc' } },
  { label: 'Professor A–Z', sort: { key: 'professor', dir: 'asc' } },
]

const COLUMNS: { label: string; sortKey?: SortKey }[] = [
  { label: 'Professor', sortKey: 'professor' },
  { label: 'Level', sortKey: 'level' },
  { label: 'Observation' },
  { label: 'Date', sortKey: 'date' },
  { label: 'Signatures' },
  { label: 'Status', sortKey: 'status' },
]

function formatDate(date: string, withYear: boolean) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    ...(withYear ? { day: '2-digit', year: 'numeric' } : { day: 'numeric' }),
  })
}

function signatures(row: ReportRow) {
  if (row.observationId === null) return '—'
  return `Observer ${row.observerSigned ? '✓' : '—'} · Observee ${row.observeeSigned ? '✓' : '—'}`
}

function exportReports(rows: ReportRow[], term: string) {
  downloadCsv(
    `reports-${term.toLowerCase().replace(/\s+/g, '-') || 'cycle'}.csv`,
    ['Professor', 'Level', 'Observation', 'Details', 'Date', 'Observer signed', 'Observee signed', 'Status'],
    rows.map((r) => [
      r.professor,
      r.level,
      r.reportType ?? '',
      r.reportDetail,
      r.date ?? '',
      r.observerSigned ? 'Yes' : 'No',
      r.observeeSigned ? 'Yes' : 'No',
      r.status,
    ]),
  )
}

function ReportsPage({ navigate }: PageProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<Sort>(SORT_PRESETS[0].sort)
  const [page, setPage] = useState(1)
  const [reports, setReports] = useState<ReportRow[]>([])
  const [cycle, setCycle] = useState<EvaluationCycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getReports(controller.signal)
      .then((body) => {
        setReports(body.rows)
        setCycle(body.cycle)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to load reports')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = FILTERS.find((f) => f.key === filter)!.match
    return reports
      .filter(
        (r) =>
          match(r) &&
          (!q || [r.professor, r.reportDetail, r.reportType ?? ''].some((text) => text.toLowerCase().includes(q))),
      )
      .sort((a, b) => compare(a, b, sort))
  }, [reports, search, filter, sort])

  const term = cycle ? `${cycle.semester} ${cycle.year}` : ''
  const count = (status: ReportStatus) => reports.filter((r) => r.status === status).length
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const preset = SORT_PRESETS.findIndex((p) => p.sort.key === sort.key && p.sort.dir === sort.dir)

  const updateSort = (next: Sort) => {
    setSort(next)
    setPage(1)
  }

  const toggleSort = (key: SortKey) =>
    updateSort(sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Reports</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {term || 'Current cycle'} · {count('Signed off')} signed off · {count('Awaiting sign-off')} awaiting
            sign-off · {count('Report overdue')} reports overdue · {count('No report')} without an observer
          </p>
          {error && <p className="mt-1 text-[11px] text-[#b3261e]">{error}</p>}
        </div>
        <button
          type="button"
          onClick={() => exportReports(rows, term)}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
        >
          Export CSV
        </button>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex min-w-56 flex-1 basis-56 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 lg:max-w-56">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-400" aria-hidden="true" />
          <span className="sr-only">Search reports</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search professors, observers, or courses"
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </label>

        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(f.key)
                setPage(1)
              }}
              className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                active
                  ? 'border-[#1c4532] bg-[#1c4532] text-white'
                  : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
              }`}
            >
              {f.label}
            </button>
          )
        })}

        <label className="ml-auto flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] text-neutral-500">
          Sort:
          <select
            value={preset}
            onChange={(e) => updateSort(SORT_PRESETS[Number(e.target.value)].sort)}
            className="bg-transparent text-neutral-900 focus:outline-none"
          >
            {preset === -1 && <option value={-1}>Custom</option>}
            {SORT_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[11px]">
            <thead>
              <tr className="bg-neutral-50 text-[10px] text-neutral-600">
                {COLUMNS.map((col) => {
                  const active = col.sortKey !== undefined && sort.key === col.sortKey
                  return (
                    <th
                      key={col.label}
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className="px-3 py-2.5 text-left font-normal first:pl-4"
                    >
                      {col.sortKey ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.sortKey!)}
                          className={`flex items-center gap-1 ${active ? 'font-medium text-neutral-900' : ''}`}
                        >
                          {col.label}
                          <span className={active ? 'text-[#e0791a]' : ''} aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={row.observationId === null ? undefined : () => navigate('Observation Report', String(row.observationId))}
                  className={`border-t border-neutral-100 ${row.observationId === null ? '' : 'cursor-pointer hover:bg-neutral-50'}`}
                >
                  <td className="px-3 py-2.5 pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-7 w-7 shrink-0 rounded-full ${AVATAR_COLORS[row.avatar]}`} aria-hidden="true" />
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">{row.professor}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap text-white ${LEVEL_BADGES[row.level]}`}>
                      {row.level}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className={row.reportType ? 'text-neutral-900' : 'text-neutral-500'}>
                      {row.reportType ?? 'No observation'}
                    </p>
                    <p className="text-[10px] text-neutral-500">{row.reportDetail}</p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.date === null ? (
                      <span className="text-neutral-500">—</span>
                    ) : row.status === 'Report overdue' ? (
                      <span className="text-[#b3261e]">Due {formatDate(row.date, false)}</span>
                    ) : (
                      <span className="text-neutral-900">{formatDate(row.date, true)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] whitespace-nowrap text-neutral-900">{signatures(row)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap text-white ${STATUS_PILLS[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-10 text-center text-neutral-500">
                    {loading ? 'Loading reports…' : 'No reports match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 text-[10px] text-neutral-500">
          <span>
            {rows.length === 0
              ? 'No professors'
              : `Showing ${(current - 1) * PAGE_SIZE + 1}–${(current - 1) * PAGE_SIZE + visible.length} of ${rows.length} professors`}
          </span>
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <button
              type="button"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
              className="px-2 py-1 disabled:text-neutral-300"
            >
              ‹ Prev
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={n === current ? 'page' : undefined}
                onClick={() => setPage(n)}
                className={`h-6 min-w-6 rounded px-1.5 ${
                  n === current ? 'bg-[#1c4532] text-white' : 'text-neutral-800 hover:bg-neutral-200'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={current === pageCount}
              onClick={() => setPage(current + 1)}
              className="px-2 py-1 text-neutral-800 disabled:text-neutral-300"
            >
              Next ›
            </button>
          </nav>
        </footer>
      </section>
    </main>
  )
}

export default ReportsPage
