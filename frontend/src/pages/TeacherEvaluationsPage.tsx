import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SignupActions, SignupStatus } from '../components/SignupActions'
import { useSignups } from '../hooks/useSignups'
import SortHeader from '../components/SortHeader'
import {
  EVALUATION_LOG,
  EVALUATION_REQUIREMENT,
  OPEN_SIGNUPS,
  RECEIVED_REPORTS,
  TEACHER_TODAY,
  UPCOMING,
} from '../data/teacherMock'
import type { HistoryEntry, HistoryType, UpcomingEvaluation } from '../data/teacherMock'
import { useSortedRows } from '../hooks/useSortedRows'
import type { Comparators } from '../hooks/useSortedRows'
import { downloadCsv } from '../utils/csv'
import { loadSignoff } from '../utils/signoffs'
import type { PageProps } from '../pageProps'

const HISTORY_BADGES: Record<HistoryType, string> = {
  Observing: 'bg-[#1c4532] text-white',
  Observed: 'bg-[#e0791a] text-white',
  Evaluation: 'bg-neutral-100 text-neutral-600',
}

const secondary =
  'rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-neutral-900 transition-colors hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-white'
const primary =
  'rounded-md bg-[#c4561a] px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-white transition-colors hover:bg-[#a9481a]'
const card = 'min-w-0 rounded-lg border border-neutral-200 bg-white p-4'

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

function format(iso: string, options: Intl.DateTimeFormatOptions) {
  return toDate(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...options })
}

function daysBetween(from: string, to: string) {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)
}

function clock(time: string) {
  const [h, m] = time.split(':').map(Number)
  return { text: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, meridiem: h < 12 ? 'AM' : 'PM' }
}

/** "13:00", "14:15" → "1:00–2:15 PM"; "11:30", "12:45" → "11:30 AM–12:45 PM"; short drops AM/PM. */
function timeRange(start: string, end: string, short = false) {
  const a = clock(start)
  const b = clock(end)
  if (short) return `${a.text}–${b.text}`
  return a.meridiem === b.meridiem ? `${a.text}–${b.text} ${b.meridiem}` : `${a.text} ${a.meridiem}–${b.text} ${b.meridiem}`
}

/** "CS 4348 Operating Systems" → "CS 4348". */
function courseNumber(course: string) {
  return course.split(' ').slice(0, 2).join(' ')
}

/** "tomorrow, Wed Oct 21", "today, …", or "Wed Oct 21". */
function dueLabel(iso: string) {
  const date = format(iso, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
  const days = daysBetween(TEACHER_TODAY, iso)
  if (days === 0) return `today, ${date}`
  if (days === 1) return `tomorrow, ${date}`
  return date
}

/** A colleague has submitted their report on your class and it still needs your signature. */
function awaitingMySignature(u: UpcomingEvaluation) {
  return u.kind === 'Being observed' && Boolean(RECEIVED_REPORTS[u.id]) && !loadSignoff(u.id)
}

function monthsUntil(isoMonth: string) {
  const [y, m] = isoMonth.split('-').map(Number)
  const [ty, tm] = TEACHER_TODAY.split('-').map(Number)
  return (y - ty) * 12 + (m - tm)
}

const HISTORY_COMPARATORS: Comparators<HistoryEntry, 'date' | 'type' | 'with' | 'status'> = {
  date: (a, b) => a.date.localeCompare(b.date),
  type: (a, b) => a.type.localeCompare(b.type),
  with: (a, b) => a.withCourse.localeCompare(b.withCourse),
  status: (a, b) => a.status.localeCompare(b.status),
}

function TeacherEvaluationsPage({ navigate }: PageProps) {
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(() => new Set())
  const [offered, setOffered] = useState<Set<number>>(() => new Set())
  const [showHistory, setShowHistory] = useState(false)

  const sessions = useMemo(
    () => UPCOMING.map((u) => (confirmedIds.has(u.id) ? { ...u, confirmed: true } : u)),
    [confirmedIds],
  )
  const upcoming = sessions
    .filter((u) => u.date >= TEACHER_TODAY)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const completed = sessions
    .filter((u) => u.date < TEACHER_TODAY)
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start))

  const confirm = (id: number) => setConfirmedIds((prev) => new Set(prev).add(id))
  const openReport = (id: number) => navigate('Observation Report', String(id))

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Your evaluation cycle, evaluations you receive, and evaluations you give · Fall 2026
          </p>
          <SignupStatus />
        </div>
        <div className="flex gap-2">
          <SignupActions />
        </div>
      </header>

      <div className="mt-5 space-y-4">
        <AttentionCard sessions={sessions} onConfirm={confirm} onOpenReport={openReport} />
        <StatsRow sessions={sessions} />
        <OpenSignupsCard offered={offered} onOffer={(id) => setOffered((prev) => new Set(prev).add(id))} />
        <UpcomingSessionsCard
          items={upcoming}
          onConfirm={confirm}
          onOpenReport={openReport}
          onOpenCalendar={() => navigate('Dashboard')}
        />
        <RecentlyCompletedCard
          items={completed}
          onOpenReport={openReport}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory((v) => !v)}
        />
        {showHistory && <HistoryCard />}
      </div>
    </main>
  )
}

function AttentionCard({
  sessions,
  onConfirm,
  onOpenReport,
}: {
  sessions: UpcomingEvaluation[]
  onConfirm: (id: number) => void
  onOpenReport: (id: number) => void
}) {
  const reports = sessions
    .filter((u) => u.kind === 'Observing' && u.reportDue && u.reportDue >= TEACHER_TODAY)
    .sort((a, b) => a.reportDue!.localeCompare(b.reportDue!))
  const toSign = sessions.filter(awaitingMySignature).sort((a, b) => a.date.localeCompare(b.date))
  const visits = sessions
    .filter((u) => u.kind === 'Being observed' && !u.confirmed && u.date >= TEACHER_TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
  const count = reports.length + toSign.length + visits.length

  return (
    <section className={card}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-[#b3261e] text-[9px] leading-none font-bold text-[#b3261e]"
          aria-hidden="true"
        >
          !
        </span>
        <h2 className="text-sm font-semibold text-neutral-900">Needs your attention</h2>
        <span className="text-[11px] text-neutral-500">
          {count} item{count === 1 ? '' : 's'}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {reports.map((u) => (
          <AttentionItem
            key={`report-${u.id}`}
            tone="red"
            title={`Submit your report for ${u.otherProfessor}`}
            detail={`Due ${dueLabel(u.reportDue!)} · observed ${courseNumber(u.course)} Sec ${u.section} on ${format(u.date, { month: 'short', day: 'numeric' })}`}
          >
            <button type="button" onClick={() => onOpenReport(u.id)} className={primary}>
              Submit report
            </button>
          </AttentionItem>
        ))}
        {toSign.map((u) => (
          <AttentionItem
            key={`sign-${u.id}`}
            tone="orange"
            title={`Review and sign ${u.otherProfessor}’s report`}
            detail={`Observed your ${courseNumber(u.course)} Sec ${u.section} on ${format(u.date, { month: 'short', day: 'numeric' })}`}
          >
            <button type="button" onClick={() => onOpenReport(u.id)} className={primary}>
              Review and sign
            </button>
          </AttentionItem>
        ))}
        {visits.map((u) => (
          <AttentionItem
            key={`visit-${u.id}`}
            tone="orange"
            title={`Confirm ${u.otherProfessor}’s visit to your class`}
            detail={[
              `${courseNumber(u.course)} Sec ${u.section}`,
              `${format(u.date, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')}, ${timeRange(u.start, u.end, true)}`,
              u.room,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <button type="button" className={secondary}>
              Propose new time
            </button>
            <button type="button" onClick={() => onConfirm(u.id)} className={primary}>
              Confirm
            </button>
          </AttentionItem>
        ))}
        {count === 0 && <li className="py-3 text-center text-[11px] text-neutral-500">You’re all caught up.</li>}
      </ul>
    </section>
  )
}

function AttentionItem({
  tone,
  title,
  detail,
  children,
}: {
  tone: 'red' | 'orange'
  title: string
  detail: string
  children: ReactNode
}) {
  const styles = tone === 'red' ? 'border-[#f3c9c4] bg-[#fdeeec]' : 'border-[#f5d3b3] bg-[#fdf1e6]'
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-md border px-3.5 py-2.5 ${styles}`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-neutral-900">{title}</p>
        <p className={`mt-0.5 text-[10px] ${tone === 'red' ? 'text-[#b3261e]' : 'text-neutral-600'}`}>{detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  )
}

function StatsRow({ sessions }: { sessions: UpcomingEvaluation[] }) {
  const req = EVALUATION_REQUIREMENT
  const months = monthsUntil(req.nextDueMonth)
  const given = sessions.filter((u) => u.kind === 'Observing')
  const done = given.filter((u) => u.date < TEACHER_TODAY)
  const due = done.filter((u) => u.reportDue).length
  const submitted = done.length - due

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <StatCard label="Next formal evaluation" value={<span className="text-2xl">{req.nextDue}</span>}>
        {req.cycle} · about {months} month{months === 1 ? '' : 's'} away
      </StatCard>
      <StatCard
        label="Observations received"
        value={
          <>
            <span className="text-2xl">{req.observationsReceived}</span>
            <span className="ml-1 text-xs font-normal text-neutral-600">this cycle</span>
          </>
        }
      >
        Evaluation required {req.frequency.toLowerCase()}
      </StatCard>
      <StatCard
        label="Evaluations you give"
        value={
          <>
            <span className="text-2xl">{given.length}</span>
            <span className="ml-1 text-xs font-normal text-neutral-600">this term</span>
          </>
        }
      >
        {submitted} report{submitted === 1 ? '' : 's'} submitted · {due} due
      </StatCard>
    </div>
  )
}

function StatCard({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white px-4 py-3.5">
      <h2 className="text-[11px] text-neutral-600">{label}</h2>
      <p className="mt-1 font-semibold text-neutral-900">{value}</p>
      <div className="mt-1 text-[10px] text-neutral-500">{children}</div>
    </section>
  )
}

function OpenSignupsCard({ offered, onOffer }: { offered: Set<number>; onOffer: (id: number) => void }) {
  const open = OPEN_SIGNUPS.filter((s) => !offered.has(s.id)).length

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Faculty signed up to be observed</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">Pick a class that fits your schedule and offer to observe it.</p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-medium text-neutral-700">
          {open} open
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200">
        <table className="w-full min-w-140 text-[11px]">
          <thead>
            <tr className="bg-neutral-50 text-[10px] tracking-wide text-neutral-500 uppercase">
              <th className="px-3 py-2 text-left font-medium">Observee</th>
              <th className="px-3 py-2 text-left font-medium">Course</th>
              <th className="px-3 py-2 text-left font-medium">Section</th>
              <th className="px-3 py-2 text-left font-medium">Days</th>
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {OPEN_SIGNUPS.map((s) => {
              const sent = offered.has(s.id)
              return (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-neutral-900">{s.name}</p>
                    <a href={`mailto:${s.email}`} className="text-[10px] text-neutral-500 underline hover:text-neutral-700">
                      {s.email}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 font-semibold whitespace-nowrap text-neutral-900">{s.course}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{s.section}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-neutral-700">{s.days}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-neutral-700">{timeRange(s.start, s.end)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" disabled={sent} onClick={() => onOffer(s.id)} className={secondary}>
                      {sent ? 'Offer sent' : 'Offer to observe'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DateBlock({ iso, boxed }: { iso: string; boxed?: boolean }) {
  return (
    <div
      className={`flex w-10 shrink-0 flex-col items-center justify-center ${boxed ? 'h-11 rounded-md border border-neutral-200 bg-white' : ''}`}
    >
      <span className={`text-[8px] font-semibold uppercase ${boxed ? 'text-[#c4561a]' : 'text-neutral-500'}`}>
        {format(iso, { month: 'short' })}
      </span>
      <span className="text-sm leading-tight font-semibold text-neutral-900">{format(iso, { day: 'numeric' })}</span>
    </div>
  )
}

/** "Observing you" / "You observe(d)" chip with a small person or eye glyph. */
function RoleChip({ observedYou, past }: { observedYou: boolean; past: boolean }) {
  const label = observedYou ? (past ? 'Observed you' : 'Observing you') : past ? 'You observed' : 'You observe'
  const styles = observedYou ? 'bg-[#e8eefb] text-[#2f4f8f]' : 'bg-[#e6f1ea] text-[#1c4532]'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[9px] font-medium ${styles}`}>
      {observedYou ? (
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      )}
      {label}
    </span>
  )
}

function sessionTitle(u: UpcomingEvaluation) {
  return u.kind === 'Being observed'
    ? `${u.otherProfessor} → your ${courseNumber(u.course)}`
    : `${u.otherProfessor} · ${courseNumber(u.course)}`
}

function UpcomingSessionsCard({
  items,
  onConfirm,
  onOpenReport,
  onOpenCalendar,
}: {
  today: string
  items: UpcomingEvaluation[]
  onConfirm: (id: number) => void
  onOpenReport: (id: number) => void
  onOpenCalendar: () => void
}) {
  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Upcoming sessions</h2>
        <button type="button" onClick={onOpenCalendar} className="shrink-0 text-[11px] font-medium text-[#c4561a] hover:underline">
          Open calendar →
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((u) => {
          const observedYou = u.kind === 'Being observed'
          const details = [
            `Sec ${u.section}`,
            `${format(u.date, { weekday: 'short' })} ${timeRange(u.start, u.end, true)}`,
            u.room,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 px-3 py-2.5">
              <DateBlock iso={u.date} boxed />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-900">
                  <RoleChip observedYou={observedYou} past={false} />
                  {sessionTitle(u)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-neutral-500">{details}</p>
                <p className={`mt-0.5 flex items-center gap-1 text-[10px] ${u.confirmed ? 'text-[#3f8a55]' : 'text-[#c4561a]'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${u.confirmed ? 'bg-[#3f8a55]' : 'bg-[#c4561a]'}`} aria-hidden="true" />
                  {u.confirmed ? 'Confirmed' : 'Waiting for your confirmation'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {observedYou ? (
                  <button type="button" className={secondary}>
                    View rubric
                  </button>
                ) : (
                  <button type="button" onClick={() => onOpenReport(u.id)} className={secondary}>
                    Evaluation form
                  </button>
                )}
                {!u.confirmed && (
                  <button type="button" onClick={() => onConfirm(u.id)} className={primary}>
                    Confirm
                  </button>
                )}
              </div>
            </li>
          )
        })}
        {items.length === 0 && <li className="py-6 text-center text-[11px] text-neutral-500">Nothing scheduled.</li>}
      </ul>
    </section>
  )
}

function RecentlyCompletedCard({
  items,
  onOpenReport,
  showHistory,
  onToggleHistory,
}: {
  items: UpcomingEvaluation[]
  onOpenReport: (id: number) => void
  showHistory: boolean
  onToggleHistory: () => void
}) {
  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">Recently completed</h2>
        <button
          type="button"
          onClick={onToggleHistory}
          aria-expanded={showHistory}
          className="shrink-0 text-[11px] font-medium text-[#c4561a] hover:underline"
        >
          {showHistory ? 'Hide history ↑' : 'See all history →'}
        </button>
      </div>

      <ul className="mt-2 divide-y divide-neutral-100">
        {items.map((u) => {
          const observedYou = u.kind === 'Being observed'
          const reportDue = !observedYou && u.reportDue
          const received = observedYou && Boolean(RECEIVED_REPORTS[u.id])
          const toSign = awaitingMySignature(u)
          const title = observedYou
            ? `${u.otherProfessor} → your ${courseNumber(u.course)} Sec ${u.section}`
            : `${u.otherProfessor} · ${courseNumber(u.course)} Sec ${u.section}`
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <DateBlock iso={u.date} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-900">
                  <RoleChip observedYou={observedYou} past />
                  {title}
                </p>
                {reportDue ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#b3261e]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#b3261e]" aria-hidden="true" />
                    Report due {dueLabel(u.reportDue!).split(',')[0]}
                  </p>
                ) : toSign ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#c4561a]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c4561a]" aria-hidden="true" />
                    Waiting for your signature
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-[#3f8a55]">
                    ✓ {received ? 'Signed' : observedYou ? 'Feedback ready' : 'Report submitted'}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {reportDue ? (
                  <button type="button" onClick={() => onOpenReport(u.id)} className={primary}>
                    Submit report
                  </button>
                ) : toSign ? (
                  <button type="button" onClick={() => onOpenReport(u.id)} className={primary}>
                    Review and sign
                  </button>
                ) : received ? (
                  <button type="button" onClick={() => onOpenReport(u.id)} className={secondary}>
                    View report
                  </button>
                ) : observedYou ? (
                  <button type="button" className={secondary}>
                    View feedback
                  </button>
                ) : (
                  <button type="button" onClick={() => onOpenReport(u.id)} className={secondary}>
                    View report
                  </button>
                )}
              </div>
            </li>
          )
        })}
        {items.length === 0 && <li className="py-6 text-center text-[11px] text-neutral-500">Nothing completed yet.</li>}
      </ul>
    </section>
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
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            History
            <MockDataBadge />
          </h2>
          <MockDataNote>Past observations have no API yet.</MockDataNote>
        </div>
        <button type="button" onClick={exportHistory} className="shrink-0 text-[11px] font-medium text-[#c4561a] hover:underline">
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
                  <a href="#" onClick={(e) => e.preventDefault()} className="text-[#c4561a] hover:underline">
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

export default TeacherEvaluationsPage
