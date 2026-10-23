import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { EligibleObserver } from '../api/signups'
import { getProfessorEvaluationStatus } from '../api/evaluationStatus'
import { DEMO_PROFESSOR_ID, loggedInProfessorId } from '../auth/session'
import { MockDataBadge, MockDataNote } from '../components/MockData'
import { SignupActions, SignupStatus } from '../components/SignupActions'
import { useSignups } from '../hooks/useSignups'
import SortHeader from '../components/SortHeader'
import {
  AVAILABLE_OBSERVERS,
  EVALUATION_LOG,
  EVALUATION_REQUIREMENT,
  OBSERVER_REQUESTS,
  TEACHER_PROFILE,
  TEACHER_TODAY,
  UPCOMING,
} from '../data/teacherMock'
import type { HistoryEntry, HistoryType, ObserverRequest, UpcomingEvaluation, UpcomingKind } from '../data/teacherMock'
import { useSortedRows } from '../hooks/useSortedRows'
import type { Comparators } from '../hooks/useSortedRows'
import { downloadCsv } from '../utils/csv'
import type { PageProps } from '../pageProps'

const KIND_BADGES: Record<UpcomingKind, string> = {
  'Being observed': 'bg-[#e0791a] text-white',
  Observing: 'bg-[#1c4532] text-white',
}

const HISTORY_BADGES: Record<HistoryType, string> = {
  Observing: 'bg-[#1c4532] text-white',
  Observed: 'bg-[#e0791a] text-white',
  Evaluation: 'bg-neutral-100 text-neutral-600',
}

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

type Tab = 'upcoming' | 'history' | 'matching' | 'requests'
type RequestAnswer = 'accepted' | 'declined'

function TeacherEvaluationsPage({ navigate }: PageProps) {
  const { signup, cycle } = useSignups()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(() => new Set())
  const [requested, setRequested] = useState<Set<number>>(() => new Set())
  const [answers, setAnswers] = useState<Record<number, RequestAnswer>>({})
  const [nextEvaluation, setNextEvaluation] = useState(TEACHER_PROFILE.nextEvaluation)
  const [cycleLabel, setCycleLabel] = useState(EVALUATION_REQUIREMENT.cycle)

  useEffect(() => {
    const professorId = loggedInProfessorId() ?? DEMO_PROFESSOR_ID
    const controller = new AbortController()
    getProfessorEvaluationStatus(professorId, controller.signal)
      .then((status) => {
        setNextEvaluation(
          status.next_due_year ? `${status.next_due_semester ?? ''} ${status.next_due_year}`.trim() : '—',
        )
        setCycleLabel(status.frequency_years === 1 ? '1-year cycle' : `${status.frequency_years ?? 2}-year cycle`)
      })
      .catch(() => {
        /* keep defaults */
      })
    return () => controller.abort()
  }, [])

  const upcoming = useMemo(
    () => UPCOMING.map((u) => (confirmedIds.has(u.id) ? { ...u, confirmed: true } : u)),
    [confirmedIds],
  )

  const toGive = upcoming.filter((u) => u.kind === 'Observing')
  const awaiting = upcoming.filter((u) => !u.confirmed).length
  const reportsDue = upcoming.filter((u) => u.reportDue).sort((a, b) => a.reportDue!.localeCompare(b.reportDue!))
  const pendingRequests = OBSERVER_REQUESTS.filter((r) => !answers[r.id]).length
  const req = {
    ...EVALUATION_REQUIREMENT,
    received: signup ? 1 : 0,
    required: 1,
    nextDue: nextEvaluation,
    cycle: cycleLabel,
  }
  const termLabel = cycle ? `${cycle.semester} ${cycle.year}` : '—'

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'upcoming', label: 'Upcoming', count: awaiting },
    { id: 'history', label: 'History' },
    { id: 'matching', label: 'Observer Matching' },
    { id: 'requests', label: 'Observation Requests', count: pendingRequests },
  ]

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      <div className="px-6 py-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Your evaluation cycle, the observation you receive, and observations you give · {termLabel}
            </p>
            <SignupStatus />
          </div>
          <div className="flex gap-2">
            <SignupActions />
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Next formal evaluation"
            value={nextEvaluation}
            detail={`Due ${req.nextDue} · ${req.cycle}`}
          />
          <StatCard
            label="Observation signup"
            value={`${req.received} of ${req.required}`}
            detail={signup ? `${signup.course_code}.${signup.section_name} · ${signup.status}` : 'Not signed up this cycle'}
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

        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
          {tab === 'upcoming' && (
            <UpcomingCard
              today={TEACHER_TODAY}
              items={upcoming}
              onConfirm={(id) => setConfirmedIds((prev) => new Set(prev).add(id))}
              onOpenReport={(id) => navigate('Observation Report', String(id))}
            />
          )}
          {tab === 'history' && <HistoryCard />}
          {tab === 'matching' && (
            <ObserverMatchingCard
              observers={signup?.observers ?? []}
              insufficient={Boolean(signup?.insufficient)}
              signupStatus={signup?.status ?? null}
              requested={requested}
              onRequest={(id) => setRequested((prev) => new Set(prev).add(id))}
            />
          )}
          {tab === 'requests' && (
            <ObservationRequestsCard answers={answers} onAnswer={(id, a) => setAnswers((prev) => ({ ...prev, [id]: a }))} />
          )}
        </div>
      </div>
    </main>
  )
}

/** Browser-style tab strip pinned to the top of the page. */
function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[]
  active: T
  onChange: (id: T) => void
}) {
  // Left/right arrows move between tabs, as in a native tab list.
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    onChange(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Evaluation sections"
      className="sticky top-0 z-10 flex items-end gap-0.5 overflow-x-auto bg-neutral-300/70 px-3 pt-2"
    >
      {tabs.map((t, i) => {
        const selected = t.id === active
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex min-w-36 shrink-0 items-center gap-2 rounded-t-lg px-4 py-2 text-xs whitespace-nowrap transition-colors ${
              selected
                ? 'bg-neutral-100 font-medium text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-200/80 hover:text-neutral-900'
            }`}
          >
            {selected && <span className="absolute inset-x-3 top-0 h-0.5 rounded-b bg-[#e0791a]" aria-hidden="true" />}
            {t.label}
            {!!t.count && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-medium ${
                  selected ? 'bg-[#e0791a] text-white' : 'bg-neutral-400/60 text-neutral-800'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
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

function UpcomingCard({
  today,
  items,
  onConfirm,
  onOpenReport,
}: {
  today: string
  items: UpcomingEvaluation[]
  onConfirm: (id: number) => void
  onOpenReport: (id: number) => void
}) {
  const [sort, setSort] = useState<'date' | 'type'>('date')
  const sorted = useMemo(
    () =>
      items
        .filter((u) => u.date >= today)
        .sort(
          (a, b) =>
            (sort === 'type' ? a.kind.localeCompare(b.kind) : 0) ||
            a.date.localeCompare(b.date) ||
            a.start.localeCompare(b.start),
        ),
    [items, sort, today],
  )

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            Upcoming
            <MockDataBadge />
          </h2>
          <MockDataNote>No observation-request API yet. These sessions are placeholders.</MockDataNote>
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
          <UpcomingRow
            key={item.id}
            item={item}
            onConfirm={() => onConfirm(item.id)}
            onOpenReport={() => onOpenReport(item.id)}
          />
        ))}
        {sorted.length === 0 && <li className="py-6 text-center text-[11px] text-neutral-500">Nothing scheduled.</li>}
      </ul>
    </section>
  )
}

function UpcomingRow({
  item,
  onConfirm,
  onOpenReport,
}: {
  item: UpcomingEvaluation
  onConfirm: () => void
  onOpenReport: () => void
}) {
  const observed = item.kind === 'Being observed'
  const title = observed ? `Observed by ${item.otherProfessor}` : `Observing ${item.otherProfessor}`
  const courseNumber = item.course.split(' ').slice(0, 2).join(' ')
  const details = [
    `${courseNumber} Sec ${item.section}`,
    `${format(item.date, { weekday: 'short' })} ${item.start}–${item.end}`,
  ].join(' · ')

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
          <button type="button" onClick={onConfirm} className={primary}>
            Confirm
          </button>
        ) : (
          !observed && (
            <button type="button" onClick={onOpenReport} className={secondary}>
              Evaluation form
            </button>
          )
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
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            History
            <MockDataBadge />
          </h2>
          <MockDataNote>Past observations have no API yet.</MockDataNote>
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

function ObserverMatchingCard({
  observers,
  insufficient,
  signupStatus,
  requested,
  onRequest,
}: {
  observers: EligibleObserver[]
  insufficient: boolean
  signupStatus: string | null
  requested: Set<number>
  onRequest: (id: number) => void
}) {
  const live = observers.length > 0
  const mockObservers = AVAILABLE_OBSERVERS.map((o) => ({
    observer_id: o.id,
    name: o.name,
    department: o.teaching,
  }))
  const shown = live ? observers : mockObservers

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            Observer Matching
            {!live && <MockDataBadge />}
          </h2>
          {live ? (
            <p className="mt-0.5 text-[10px] text-neutral-500">
              Up to 5 colleagues in your department who teach the same course level and are free at this class time
              {signupStatus ? ` · signup ${signupStatus}` : ''}
            </p>
          ) : (
            <MockDataNote>
              Eligibility list is empty until signup/observer-list APIs return names. Showing placeholders.
            </MockDataNote>
          )}
        </div>
      </div>

      {insufficient && live && (
        <p className="mt-3 rounded-md bg-[#fdf1e6] px-3 py-2 text-[11px] text-[#c4561a]">
          Fewer than 5 eligible observers — Assessment Committee sees this as an alert.
        </p>
      )}

      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((o) => {
          const sent = requested.has(o.observer_id)
          return (
            <li key={o.observer_id} className="rounded-md bg-neutral-50 p-2.5">
              <div className="flex items-start gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-[#1c4532]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-neutral-900">{o.name}</p>
                  <p className="truncate text-[9px] text-neutral-500">{o.department}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[9px] text-neutral-500">
                  {live ? 'Same level · same department' : 'Placeholder observer'}
                </span>
                <button
                  type="button"
                  disabled={sent}
                  onClick={() => onRequest(o.observer_id)}
                  className={`${secondary} disabled:text-neutral-400 disabled:hover:bg-white`}
                >
                  {sent ? 'Requested' : 'Request'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ObservationRequestsCard({
  answers,
  onAnswer,
}: {
  answers: Record<number, RequestAnswer>
  onAnswer: (id: number, answer: RequestAnswer) => void
}) {
  const requests: ObserverRequest[] = [...OBSERVER_REQUESTS].sort((a, b) => a.due.localeCompare(b.due))

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          Observation Requests
          <MockDataBadge />
        </h2>
        <MockDataNote>Incoming requests have no API yet (observer-request stubs).</MockDataNote>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {requests.map((r) => {
          const answer = answers[r.id]
          const overdue = r.due < TEACHER_TODAY
          return (
            <li
              key={r.id}
              className={`rounded-md border p-2.5 ${answer ? 'border-neutral-200 bg-neutral-50' : 'border-[#e0791a] bg-[#fdf1e6]'}`}
            >
              <p className="text-[11px] font-semibold text-neutral-900">
                {r.name} · {r.rank}
              </p>
              <p className="truncate text-[9px] text-neutral-500">{r.teaching}</p>
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
                    <button type="button" onClick={() => onAnswer(r.id, 'declined')} className={secondary}>
                      Decline
                    </button>
                    <button type="button" onClick={() => onAnswer(r.id, 'accepted')} className={primary}>
                      Accept
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default TeacherEvaluationsPage
