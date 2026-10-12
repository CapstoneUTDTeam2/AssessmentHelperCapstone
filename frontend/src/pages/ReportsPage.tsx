import { useMemo, useState } from 'react'
import { CYCLE_START, REPORT_SUMMARY, REPORTS } from '../data/reportsMock'
import type { ReportOutcome, ReportRow, ReportStatus } from '../data/reportsMock'
import type { FacultyLevel } from '../data/facultyMock'

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

const OUTCOME_DOTS: Record<ReportOutcome, string> = {
  'Exceeds expectations': 'bg-[#3f8a55]',
  'Meets expectations': 'bg-[#1c4532]',
  'Needs improvement': 'bg-[#e0791a]',
}

const STATUS_PILLS: Record<ReportStatus, string> = {
  'Awaiting sign-off': 'bg-[#e0791a]',
  'Signed off': 'bg-[#3f8a55]',
  'Report overdue': 'bg-[#b3261e]',
  'No report': 'bg-neutral-500',
}

type FilterKey = 'all' | 'awaiting' | 'signed' | 'overdue' | 'cycle'

const FILTERS: { key: FilterKey; label: string; match: (r: ReportRow) => boolean }[] = [
  { key: 'all', label: 'All reports', match: () => true },
  { key: 'awaiting', label: 'Awaiting sign-off', match: (r) => r.status === 'Awaiting sign-off' },
  { key: 'signed', label: 'Signed off', match: (r) => r.status === 'Signed off' },
  { key: 'overdue', label: 'Report overdue', match: (r) => r.status === 'Report overdue' },
  { key: 'cycle', label: 'This cycle', match: (r) => r.date !== null && r.date >= CYCLE_START },
]

type SortKey = 'professor' | 'level' | 'date' | 'outcome' | 'status'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

/** Filed reports first, then pending (overdue) ones, then faculty with nothing on file. */
const DATE_RANK: Record<ReportStatus, number> = {
  'Awaiting sign-off': 0,
  'Signed off': 0,
  'Report overdue': 1,
  'No report': 2,
}

function compare(a: ReportRow, b: ReportRow, { key, dir }: Sort) {
  const flip = dir === 'asc' ? 1 : -1
  if (key === 'date') {
    // Rank stays fixed so pending and missing reports always sit at the bottom.
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
  { label: 'Most recent report' },
  { label: 'Report date', sortKey: 'date' },
  { label: 'Outcome', sortKey: 'outcome' },
  { label: 'Status', sortKey: 'status' },
]

function formatDate(date: string, withYear: boolean) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    ...(withYear ? { day: '2-digit', year: 'numeric' } : { day: 'numeric' }),
  })
}

function downloadCsv(rows: ReportRow[]) {
  const header = ['Professor', 'Email', 'Level', 'Report', 'Details', 'Date', 'Outcome', 'Status']
  const lines = [header, ...rows.map((r) => [r.professor, r.email, r.level, r.reportType ?? '', r.reportDetail, r.date ?? '', r.outcome ?? '', r.status])]
  const csv = lines.map((cells) => cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'reports-fall-2026.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function ReportsPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<Sort>(SORT_PRESETS[0].sort)
  const [page, setPage] = useState(1)
  const [reminded, setReminded] = useState<Set<number>>(() => new Set())

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = FILTERS.find((f) => f.key === filter)!.match
    return REPORTS.filter(
      (r) =>
        match(r) &&
        (!q || [r.professor, r.email, r.reportDetail].some((text) => text.toLowerCase().includes(q))),
    ).sort((a, b) => compare(a, b, sort))
  }, [search, filter, sort])

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
            {REPORT_SUMMARY.faculty} faculty · Fall 2026 · {REPORT_SUMMARY.onFile} reports on file ·{' '}
            {REPORT_SUMMARY.awaitingSignOff} awaiting sign-off · {REPORT_SUMMARY.overdue} reports overdue
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadCsv(rows)}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            Download All PDFs
          </button>
        </div>
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
                <th className="w-24" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5 pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-7 w-7 shrink-0 rounded-full ${AVATAR_COLORS[row.avatar]}`} aria-hidden="true" />
                      <div>
                        <p className="text-xs font-semibold text-neutral-900">{row.professor}</p>
                        <p className="text-[10px] text-neutral-500">{row.email}</p>
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
                      {row.reportType ?? 'No report on file'}
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
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.outcome ? (
                      <span className="flex items-center gap-1.5 text-[10px] text-neutral-900">
                        <span className={`h-1.5 w-1.5 rounded-full ${OUTCOME_DOTS[row.outcome]}`} aria-hidden="true" />
                        {row.outcome}
                      </span>
                    ) : (
                      <span className="text-[10px] text-neutral-500">
                        {row.status === 'Report overdue' ? '— Pending report' : '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap text-white ${STATUS_PILLS[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <RowAction
                        row={row}
                        reminded={reminded.has(row.id)}
                        onRemind={() => setReminded((prev) => new Set(prev).add(row.id))}
                      />
                      <button
                        type="button"
                        aria-label={`More actions for ${row.professor}`}
                        className="rounded px-1 text-neutral-500 hover:bg-neutral-100"
                      >
                        ···
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="py-10 text-center text-neutral-500">
                    No reports match these filters.
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

function RowAction({ row, reminded, onRemind }: { row: ReportRow; reminded: boolean; onRemind: () => void }) {
  const base = 'text-[11px] font-medium whitespace-nowrap'
  if (row.status === 'Report overdue') {
    return (
      <button
        type="button"
        disabled={reminded}
        onClick={onRemind}
        aria-label={`Send reminder for ${row.professor}`}
        className={`${base} text-[#1c4532] hover:underline disabled:text-neutral-400 disabled:no-underline`}
      >
        {reminded ? 'Reminded' : 'Remind'}
      </button>
    )
  }
  return (
    <button
      type="button"
      aria-label={`${row.status === 'No report' ? 'Assign observer for' : 'View report for'} ${row.professor}`}
      className={`${base} text-[#1c4532] hover:underline`}
    >
      {row.status === 'No report' ? 'Assign' : 'View'}
    </button>
  )
}

export default ReportsPage
