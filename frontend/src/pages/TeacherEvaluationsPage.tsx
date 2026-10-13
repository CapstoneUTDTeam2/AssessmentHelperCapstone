import { useMemo, useState } from 'react'
import SortHeader from '../components/SortHeader'
import {
  AVAILABLE_OBSERVERS,
  EVALUATION_LOG,
  EVALUATION_REQUIREMENT,
  MY_LEVEL,
  OBSERVER_REQUESTS,
  TEACHER_PROFILE,
  TEACHER_TODAY,
  UPCOMING,
} from '../data/teacherMock'
import type { HistoryEntry, HistoryType, ObserverMatch, UpcomingEvaluation, UpcomingKind } from '../data/teacherMock'
import { useSortedRows } from '../hooks/useSortedRows'
import type { Comparators } from '../hooks/useSortedRows'
import { downloadCsv } from '../utils/csv'

const KIND_BADGES: Record<UpcomingKind, string> = {
  'Being observed': 'bg-[#e0791a] text-white',
  Observing: 'bg-[#1c4532] text-white',
}

const HISTORY_BADGES: Record<HistoryType, string> = {
  Observing: 'bg-[#1c4532] text-white',
  Observed: 'bg-[#e0791a] text-white',
  Evaluation: 'bg-neutral-100 text-neutral-600',
}

const AVATARS = { green: 'bg-[#1c4532]', orange: 'bg-[#e0791a]' }

const secondary =
  'rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[10px] whitespace-nowrap text-neutral-900 transition-colors hover:bg-neutral-50'
const primary =
  'rounded-md bg-[#e0791a] px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap text-white transition-colors hover:bg-[#c96a12]'

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

function format(iso: string, options: Intl.DateTimeFormatOptions) {
  return toDate(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...options })
}

const HISTORY_COMPARATORS: Comparators<HistoryEntry, 'date' | 'type' | 'with' | 'status'> = {
  date: (a, b) => a.date.localeCompare(b.date),
  type: (a, b) => a.type.localeCompare(b.type),
  with: (a, b) => a.withCourse.localeCompare(b.withCourse),
  status: (a, b) => a.status.localeCompare(b.status),
}

function TeacherEvaluationsPage() {
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(() => new Set())
  const upcoming = useMemo(
    () => UPCOMING.map((u) => (confirmedIds.has(u.id) ? { ...u, confirmed: true } : u)),
    [confirmedIds],
  )

  const toGive = upcoming.filter((u) => u.kind === 'Observing')
  const awaiting = upcoming.filter((u) => !u.confirmed).length
  const reportsDue = upcoming.filter((u) => u.reportDue).sort((a, b) => a.reportDue!.localeCompare(b.reportDue!))
  const req = EVALUATION_REQUIREMENT

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Your evaluation cycle, evaluations you receive, and evaluations you give · Fall 2026
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Submit Evaluation Report
          </button>
          <button
            type="button"
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            Sign Up to Observe
          </button>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Next formal evaluation"
          value={TEACHER_PROFILE.nextEvaluation}
          detail={`Due ${req.nextDue} · ${req.cycle}`}
        />
        <StatCard
          label="Evaluations received"
          value={`${req.received} of ${req.required}`}
          detail={`${req.required - req.received} more required this cycle`}
          warn={req.received < req.required}
        />
        <StatCard
          label="Evaluations to give"
          value={String(toGive.length)}
          detail={awaiting > 0 ? `${awaiting} awaiting your confirmation` : 'All confirmed'}
          warn={awaiting > 0}
        />
        <StatCard
          label="Reports due"
          value={String(reportsDue.length)}
          detail={
            reportsDue.length > 0
              ? `${reportsDue[0].otherProfessor} · due ${format(reportsDue[0].reportDue!, { month: 'short', day: 'numeric' })}`
              : 'Nothing due'
          }
          danger={reportsDue.length > 0}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_276px]">
        <div className="flex min-w-0 flex-col gap-4">
          <UpcomingCard items={upcoming} onConfirm={(id) => setConfirmedIds((prev) => new Set(prev).add(id))} />
          <HistoryCard />
        </div>
        <ObserverMatchingCard />
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  detail,
  warn,
  danger,
}: {
  label: string
  value: string
  detail: string
  warn?: boolean
  danger?: boolean
}) {
  const detailColor = danger ? 'text-[#b3261e]' : warn ? 'text-[#e0791a]' : 'text-neutral-500'
  return (
    <section className="rounded-lg border border-neutral-200 bg-white px-3.5 py-3.5">
      <span className="block h-0.5 w-5 rounded bg-[#e0791a]" aria-hidden="true" />
      <h2 className="mt-2.5 text-[11px] text-neutral-600">{label}</h2>
      <p className="mt-1 text-2xl font-semibold text-[#1c4532]">{value}</p>
      <p className={`mt-1 text-[10px] ${detailColor}`}>{detail}</p>
    </section>
  )
}

function UpcomingCard({ items, onConfirm }: { items: UpcomingEvaluation[]; onConfirm: (id: number) => void }) {
  const [sort, setSort] = useState<'date' | 'type'>('date')
  const sorted = useMemo(
    () =>
      items
        .filter((u) => u.date >= TEACHER_TODAY)
        .sort(
          (a, b) =>
            (sort === 'type' ? a.kind.localeCompare(b.kind) : 0) ||
            a.date.localeCompare(b.date) ||
            a.start.localeCompare(b.start),
        ),
    [items, sort],
  )

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Upcoming</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">Confirm, reschedule, or prepare for each session</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px]">
          <label className="flex items-center gap-1 text-neutral-500">
            Sort:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'date' | 'type')}
              className="bg-transparent text-neutral-900 focus:outline-none"
            >
              <option value="date">Date</option>
              <option value="type">Type</option>
            </select>
          </label>
          <a href="#" onClick={(e) => e.preventDefault()} className="text-[#e0791a] hover:underline">
            Open calendar →
          </a>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {sorted.map((item) => (
          <UpcomingRow key={item.id} item={item} onConfirm={() => onConfirm(item.id)} />
        ))}
        {sorted.length === 0 && <li className="py-6 text-center text-[11px] text-neutral-500">Nothing scheduled.</li>}
      </ul>
    </section>
  )
}

function UpcomingRow({ item, onConfirm }: { item: UpcomingEvaluation; onConfirm: () => void }) {
  const observed = item.kind === 'Being observed'
  const title = observed ? `Observed by ${item.otherProfessor}` : `Observing ${item.otherProfessor}`
  const courseNumber = item.course.split(' ').slice(0, 2).join(' ')
  const details = [
    `${courseNumber} Sec ${item.section}`,
    `${format(item.date, { weekday: 'short' })} ${item.start}–${item.end}`,
    item.room,
  ]
    .filter(Boolean)
    .join(' · ')

  const status = item.reportDue
    ? { text: `Report due ${format(item.reportDue, { month: 'short', day: 'numeric' })}`, color: 'text-[#b3261e]', dot: 'bg-[#b3261e]' }
    : item.confirmed
      ? { text: 'Confirmed', color: 'text-[#3f8a55]', dot: 'bg-[#3f8a55]' }
      : { text: 'Awaiting your confirmation', color: 'text-[#e0791a]', dot: 'bg-[#e0791a]' }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md bg-neutral-50 px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-neutral-200 bg-white">
        <span className="text-[8px] font-semibold text-[#e0791a] uppercase">{format(item.date, { month: 'short' })}</span>
        <span className="text-sm leading-none font-semibold text-neutral-900">{format(item.date, { day: 'numeric' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-900">
          {title}
          <span className={`rounded-full px-2 py-px text-[9px] font-medium ${KIND_BADGES[item.kind]}`}>{item.kind}</span>
        </p>
        <p className="mt-0.5 truncate text-[10px] text-neutral-500">{details}</p>
        <p className={`mt-0.5 flex items-center gap-1 text-[9px] ${status.color}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
          {status.text}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {!item.confirmed ? (
          <>
            <button type="button" onClick={onConfirm} className={primary}>
              Confirm
            </button>
            <button type="button" className={secondary}>
              Propose new time
            </button>
          </>
        ) : (
          <>
            <button type="button" className={secondary}>
              {observed ? 'View rubric' : 'Evaluation form'}
            </button>
            {!item.reportDue && (
              <button type="button" className={secondary}>
                Reschedule
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function HistoryCard() {
  const { sorted, sort, toggle } = useSortedRows(EVALUATION_LOG, HISTORY_COMPARATORS, { key: 'date', dir: 'desc' })

  const exportHistory = () =>
    downloadCsv(
      'evaluation-history.csv',
      ['Date', 'Type', 'With / Course', 'Outcome', 'Status'],
      sorted.map((h) => [h.date, h.type, h.withCourse, h.outcome ?? '', h.status]),
    )

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">History</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">Completed peer and formal evaluations</p>
        </div>
        <button type="button" onClick={exportHistory} className="shrink-0 text-[11px] text-[#e0791a] hover:underline">
          Export →
        </button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[540px] text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-neutral-600">
              <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggle} first />
              <SortHeader label="Type" sortKey="type" sort={sort} onSort={toggle} />
              <SortHeader label="With / Course" sortKey="with" sort={sort} onSort={toggle} />
              <th className="px-2 py-1.5 text-left font-normal">Outcome</th>
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
              <th className="rounded-r px-2 py-1.5 text-left font-normal">Report</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.id} className="border-b border-neutral-100">
                <td className="px-2 py-2 whitespace-nowrap text-neutral-900">
                  {format(h.date, { month: 'short', day: '2-digit', year: 'numeric' })}
                </td>
                <td className="px-2 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${HISTORY_BADGES[h.type]}`}>{h.type}</span>
                </td>
                <td className="max-w-48 px-2 py-2 text-neutral-900">{h.withCourse}</td>
                <td className="px-2 py-2 text-neutral-700">{h.outcome ?? '—'}</td>
                <td className="px-2 py-2 whitespace-nowrap text-neutral-700">{h.status}</td>
                <td className="px-2 py-2">
                  <a href="#" onClick={(e) => e.preventDefault()} className="text-[#e0791a] hover:underline">
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type AvailableSort = 'level' | 'available'
type RequestAnswer = 'accepted' | 'declined'

function ObserverMatchingCard() {
  const [availableSort, setAvailableSort] = useState<AvailableSort>('available')
  const [showAll, setShowAll] = useState(false)
  const [requested, setRequested] = useState<Set<number>>(() => new Set())
  const [answers, setAnswers] = useState<Record<number, RequestAnswer>>({})

  const available = useMemo(
    () =>
      [...AVAILABLE_OBSERVERS].sort(
        (a, b) =>
          (availableSort === 'level' ? a.level - MY_LEVEL - (b.level - MY_LEVEL) : 0) ||
          a.availableFrom.localeCompare(b.availableFrom),
      ),
    [availableSort],
  )
  const shown = showAll ? available : available.slice(0, 3)
  const requests = [...OBSERVER_REQUESTS].sort((a, b) => a.due.localeCompare(b.due))

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Observer Matching</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">
        Request an observer for your evaluation, or respond to colleagues who requested you
      </p>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-neutral-900">Available to observe you</h3>
        <label className="flex items-center gap-1 text-[9px] text-neutral-500">
          Sort:
          <select
            value={availableSort}
            onChange={(e) => setAvailableSort(e.target.value as AvailableSort)}
            className="bg-transparent text-neutral-900 focus:outline-none"
          >
            <option value="available">Soonest available</option>
            <option value="level">Nearest level</option>
          </select>
        </label>
      </div>
      <p className="text-[9px] text-neutral-500">Above your level ({MY_LEVEL}s) · request one as your observer</p>

      <ul className="mt-2 space-y-2">
        {shown.map((o) => {
          const sent = requested.has(o.id)
          return (
            <li key={o.id} className="rounded-md bg-neutral-50 p-2.5">
              <MatchHeader match={o} />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px] text-neutral-500">Available · {o.available}</span>
                <button
                  type="button"
                  disabled={sent}
                  onClick={() => setRequested((prev) => new Set(prev).add(o.id))}
                  className={`${secondary} disabled:text-neutral-400 disabled:hover:bg-white`}
                >
                  {sent ? 'Requested' : 'Request'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-neutral-900">Requested you as observer</h3>
        <span className="text-[9px] text-neutral-500">
          Sort: <span className="text-neutral-900">Due date</span>
        </span>
      </div>
      <p className="text-[9px] text-neutral-500">Below your level · they asked you to observe them</p>

      <ul className="mt-2 space-y-2">
        {requests.map((r) => {
          const answer = answers[r.id]
          const overdue = r.due < TEACHER_TODAY
          return (
            <li
              key={r.id}
              className={`rounded-md border p-2.5 ${answer ? 'border-neutral-200 bg-neutral-50' : 'border-[#e0791a] bg-[#fdf1e6]'}`}
            >
              <MatchHeader match={r} />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={`text-[9px] ${overdue && !answer ? 'text-[#b3261e]' : 'text-neutral-500'}`}>
                  Requested you · {overdue ? 'overdue' : `due ${format(r.due, { month: 'short', day: 'numeric' })}`}
                </span>
                {answer ? (
                  <span className={`text-[10px] font-medium ${answer === 'accepted' ? 'text-[#3f8a55]' : 'text-neutral-500'}`}>
                    {answer === 'accepted' ? 'Accepted' : 'Declined'}
                  </span>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [r.id]: 'declined' }))}
                      className={secondary}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [r.id]: 'accepted' }))}
                      className={primary}
                    >
                      Accept
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {AVAILABLE_OBSERVERS.length > 3 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[10px] text-[#e0791a] hover:underline">
          {showAll ? 'Show fewer observers ↑' : `See all ${AVAILABLE_OBSERVERS.length} available observers →`}
        </button>
      )}
    </section>
  )
}

function MatchHeader({ match }: { match: ObserverMatch }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`h-6 w-6 shrink-0 rounded-full ${AVATARS[match.avatar]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-neutral-900">
          {match.name} · {match.rank}
        </p>
        <p className="truncate text-[9px] text-neutral-500">{match.teaching}</p>
      </div>
      <span className="shrink-0 rounded-full bg-[#3f8a55] px-2 py-0.5 text-[9px] font-medium text-white">{match.level}s</span>
    </div>
  )
}

export default TeacherEvaluationsPage
