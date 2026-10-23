import { Fragment, useEffect, useMemo, useState } from 'react'
import { getObserveeSignupOrNull } from '../api/signups'
import type { EligibleObserver } from '../api/signups'
import { MockDataBadge, MockDataNote } from '../components/MockData'
import { getFaculty } from '../api/faculty'
import { FACULTY } from '../data/facultyMock'
import { downloadCsv } from '../utils/csv'
import type { CurrentTerm } from '../api/evaluationStatus'
import { LEVEL_COLORS } from '../theme'
import type {
  EvaluationEvent,
  EventKind,
  FacultyLevel,
  FacultyMember,
  StatusTone,
} from '../data/facultyMock'

const STATUS_PILLS: Record<StatusTone, string> = {
  due: 'bg-[#e0791a]',
  overdue: 'bg-[#b3261e]',
  ok: 'bg-[#3f8a55]',
  unknown: 'bg-neutral-500',
}

const PROGRESS_BARS: Record<StatusTone, string> = {
  due: 'bg-[#e0791a]',
  overdue: 'bg-[#b3261e]',
  ok: 'bg-[#3f8a55]',
  unknown: 'bg-neutral-500',
}

const EVENT_STYLES: Record<EventKind, { dot: string; badge: string }> = {
  Observed: { dot: 'bg-[#e0791a]', badge: 'bg-[#e0791a]' },
  Observing: { dot: 'bg-[#1c4532]', badge: 'bg-[#1c4532]' },
  Evaluation: { dot: 'bg-[#1c4532]', badge: 'bg-[#1c4532]' },
}

const LEVEL_OPTIONS: ('All levels' | FacultyLevel)[] = [
  'All levels',
  'Assistant Prof.',
  'Associate Prof.',
  'Full Prof.',
  'Lecturer',
]

type FilterKey = 'due' | 'overdue' | 'unmatched' | 'needsObserver'

const FILTERS: { key: FilterKey; label: string; match: (f: FacultyMember) => boolean }[] = [
  { key: 'due', label: 'Due this cycle', match: (f) => f.dueThisCycle },
  { key: 'overdue', label: 'Overdue', match: (f) => f.statusTone === 'overdue' },
  { key: 'unmatched', label: 'Unmatched', match: (f) => f.unmatched },
  { key: 'needsObserver', label: 'Needs observer', match: (f) => f.needsObserver },
]

type SortKey = 'next' | 'name' | 'level' | 'courses' | 'progress'

const SORT_LABELS: Record<SortKey, string> = {
  next: 'Next evaluation',
  name: 'Name',
  level: 'Level',
  courses: 'Courses',
  progress: 'Progress',
}

const COMPARATORS: Record<SortKey, (a: FacultyMember, b: FacultyMember) => number> = {
  next: (a, b) => a.nextEvaluationDate.localeCompare(b.nextEvaluationDate),
  name: (a, b) => a.name.localeCompare(b.name),
  level: (a, b) => a.level.localeCompare(b.level),
  courses: (a, b) => (a.courses[0] ?? '').localeCompare(b.courses[0] ?? ''),
  progress: (a, b) => progress(a) - progress(b),
}

/** Share of required evaluations completed; 0 when none are required yet. */
function progress(f: FacultyMember) {
  return f.required ? f.completed / f.required : 0
}

const COLUMNS: { label: string; sortKey: SortKey }[] = [
  { label: 'Faculty', sortKey: 'name' },
  { label: 'Level', sortKey: 'level' },
  { label: 'Courses', sortKey: 'courses' },
  { label: 'Evaluation obligations', sortKey: 'progress' },
  { label: 'Evaluation status', sortKey: 'next' },
]

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; term: CurrentTerm; members: FacultyMember[] }

function FacultyPage() {
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<(typeof LEVEL_OPTIONS)[number]>('All levels')
  const [filter, setFilter] = useState<FilterKey | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'next', dir: 'asc' })
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    getFaculty(controller.signal)
      .then(({ term, members }) => setLoad({ kind: 'ready', term, members }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLoad({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to load faculty' })
      })
    return () => controller.abort()
  }, [])

  const faculty = useMemo(() => (load.kind === 'ready' ? load.members : []), [load])
  const dueCount = faculty.filter((f) => f.statusTone === 'due').length
  const overdueCount = faculty.filter((f) => f.statusTone === 'overdue').length

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = filter ? FILTERS.find((f) => f.key === filter)!.match : () => true
    return faculty.filter(
      (f) =>
        match(f) &&
        (level === 'All levels' || f.level === level) &&
        (!q ||
          [f.name, f.email, f.level, ...f.courses].some((text) => text.toLowerCase().includes(q))),
    ).sort((a, b) => {
      const cmp = COMPARATORS[sort.key](a, b)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [faculty, search, level, filter, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Faculty Overview</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {load.kind === 'ready'
              ? `${faculty.length} faculty · ${load.term.semester} ${load.term.year} · ${dueCount} due for evaluation, ${overdueCount} overdue`
              : load.kind === 'loading'
                ? 'Loading faculty…'
                : 'Faculty data unavailable'}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            downloadCsv(
              'faculty.csv',
              ['Name', 'Level', 'Courses', 'Status', 'Next evaluation'],
              rows.map((f) => [f.name, f.level, f.courses.join('; '), f.status, f.details.nextEvaluation]),
            )
          }
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
        >
          Export List
        </button>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex min-w-56 flex-1 basis-56 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 lg:max-w-60">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-400" aria-hidden="true" />
          <span className="sr-only">Search faculty</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search faculty, course, or level"
            className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </label>

        <label className="relative">
          <span className="sr-only">Filter by level</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as typeof level)}
            className={`appearance-none rounded-full border px-3 py-1.5 text-[11px] focus:outline-none ${
              level === 'All levels'
                ? 'border-neutral-200 bg-white text-neutral-800'
                : 'border-[#1c4532] bg-[#1c4532] text-white'
            }`}
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(active ? null : f.key)}
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

        <label className="ml-auto flex items-center gap-1 text-[11px] text-neutral-500">
          Sort:
          <select
            value={sort.key}
            onChange={(e) => setSort({ key: e.target.value as SortKey, dir: 'asc' })}
            className="bg-transparent text-neutral-600 focus:outline-none"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-[11px]">
          <thead>
            <tr className="text-[10px] text-neutral-600">
              <th className="w-8" aria-label="Expand" />
              {COLUMNS.map((col) => {
                const active = sort.key === col.sortKey
                return (
                  <th
                    key={col.label}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className="px-2 py-2 text-left font-normal"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.sortKey)}
                      className={`flex w-full items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 ${
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
            {rows.map((member) => {
              const isOpen = expanded.has(member.id)
              return (
                <Fragment key={member.id}>
                  <tr className="border-t border-neutral-100">
                    <td className="pl-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(member.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${member.name}`}
                        className={`flex h-6 w-6 items-center justify-center rounded transition-transform hover:bg-neutral-100 ${
                          isOpen ? 'rotate-90 text-[#e0791a]' : 'text-neutral-600'
                        }`}
                      >
                        ›
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-7 w-7 shrink-0 rounded-full ${LEVEL_COLORS[member.level]}`} aria-hidden="true" />
                        <div>
                          <p className="text-xs font-semibold text-neutral-900">{member.name}</p>
                          {member.email && <p className="text-[10px] text-neutral-500">{member.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap text-white ${LEVEL_COLORS[member.level]}`}>
                        {member.level}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {member.courses.length === 0 && <span className="text-neutral-400">—</span>}
                        {member.courses.map((course) => (
                          <span key={course} className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-800">
                            {course}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      {member.required === 0 ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <>
                          <p className="text-[10px] text-neutral-800">
                            {member.completed} of {member.required} evaluations completed
                          </p>
                          <div
                            className="mt-1 h-1 w-28 rounded-full bg-neutral-200"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={member.required}
                            aria-valuenow={member.completed}
                            aria-label={`${member.name} evaluations completed`}
                          >
                            <div
                              className={`h-1 rounded-full ${PROGRESS_BARS[member.statusTone]}`}
                              style={{ width: `${Math.max(progress(member) * 100, 4)}%` }}
                            />
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium whitespace-nowrap text-white ${STATUS_PILLS[member.statusTone]}`}>
                        {member.status}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-neutral-100 bg-neutral-50">
                      <td colSpan={COLUMNS.length + 2} className="px-10 py-4">
                        <FacultyDetailsPanel member={member} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className={`py-10 text-center ${load.kind === 'error' ? 'text-[#b3261e]' : 'text-neutral-500'}`}
                >
                  {load.kind === 'loading'
                    ? 'Loading faculty…'
                    : load.kind === 'error'
                      ? `Couldn't load faculty: ${load.message}`
                      : 'No faculty match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  )
}

function FacultyDetailsPanel({ member }: { member: FacultyMember }) {
  const mockDetails = FACULTY.find((row) => row.id === member.id)?.details
  const { details } = member
  const past = details.past.length > 0 ? details.past : mockDetails?.past ?? []
  const upcoming = details.upcoming.length > 0 ? details.upcoming : mockDetails?.upcoming ?? []
  const pastIsMock = details.past.length === 0 && past.length > 0
  const [observers, setObservers] = useState<EligibleObserver[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getObserveeSignupOrNull(member.id, controller.signal)
      .then((signup) => setObservers(signup?.observers ?? []))
      .catch(() => setObservers([]))
    return () => controller.abort()
  }, [member.id])

  return (
    <div className="grid gap-3 lg:grid-cols-[1.25fr_0.85fr_1fr]">
      <section className="rounded-lg border border-neutral-200 bg-white p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900">
          Evaluations
          {pastIsMock && <MockDataBadge />}
        </h3>
        {pastIsMock && <MockDataNote>Observation history has no API yet.</MockDataNote>}
        <EventList title="Past" events={past} />
        <EventList title="Upcoming" events={upcoming} />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-3">
        <h3 className="text-xs font-semibold text-neutral-900">Profile &amp; Evaluation</h3>
        <dl className="mt-3 space-y-2.5">
          <ProfileField label="Rank" value={details.hireLevel} />
          <ProfileField label="Evaluation cycle" value={details.cycle} />
          <ProfileField label="Last evaluation" value={details.lastEvaluation} />
          <ProfileField label="Next evaluation" value={details.nextEvaluation} highlight />
          {details.instructorLevels.length > 0 && (
            <div>
              <dt className="text-[9px] text-neutral-500">Instructor level</dt>
              <dd className="mt-1 flex flex-col items-start gap-1">
                {details.instructorLevels.map((tag) => (
                  <span key={tag} className="rounded border border-[#e0791a] px-1.5 py-px text-[9px] text-[#e0791a]">
                    {tag}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="flex flex-col rounded-lg border border-neutral-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-neutral-900">Eligible Observers</h3>
          <span className="text-[9px] text-neutral-500">Same department · same course level</span>
        </div>
        <ApiObserverList observers={observers} />
      </section>
    </div>
  )
}

function EventList({ title, events }: { title: string; events: EvaluationEvent[] }) {
  return (
    <div className="mt-2.5">
      <h4 className="text-[9px] font-semibold tracking-wide text-neutral-500 uppercase">{title}</h4>
      {events.length === 0 ? (
        <p className="mt-1.5 text-[10px] text-neutral-400">None</p>
      ) : (
        <ul className="mt-1">
          {events.map((event) => (
            <li key={`${event.date}-${event.title}`} className="flex items-center gap-2.5 py-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${EVENT_STYLES[event.kind].dot}`} aria-hidden="true" />
              <span className="w-20 shrink-0 text-[10px] text-neutral-700">{event.date}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-neutral-900">{event.title}</p>
                <p className="text-[9px] text-neutral-500">{event.subtitle}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium text-white ${EVENT_STYLES[event.kind].badge}`}>
                {event.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProfileField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <dt className="text-[9px] text-neutral-500">{label}</dt>
      <dd className={`text-[11px] font-semibold ${highlight ? 'text-[#e0791a]' : 'text-neutral-900'}`}>{value}</dd>
    </div>
  )
}

function ApiObserverList({ observers }: { observers: EligibleObserver[] | null }) {
  if (observers === null) {
    return <p className="mt-2.5 text-[10px] text-neutral-400">Loading observers…</p>
  }
  if (observers.length === 0) {
    return (
      <p className="mt-2.5 text-[10px] text-neutral-400">
        No signup this cycle, or no eligible observers (same department, same course level, free at class time).
      </p>
    )
  }
  return (
    <ul className="mt-2.5 space-y-1.5">
      {observers.map((obs) => (
        <li key={obs.observer_id} className="flex items-center gap-2 rounded-md bg-neutral-50 px-2 py-1.5">
          <span className="h-5 w-5 shrink-0 rounded-full bg-[#1c4532]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-neutral-900">{obs.name}</p>
            <p className="truncate text-[9px] text-neutral-500">{obs.department}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default FacultyPage
