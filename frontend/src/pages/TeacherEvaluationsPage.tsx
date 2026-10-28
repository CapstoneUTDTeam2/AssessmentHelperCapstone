import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ProfessorObservation } from '../api/observations'
import { IncomingRequestsCard, RequestObserversCard, SurveyCard } from '../components/EvaluationRequestCards'
import { SignupActions, SignupStatus } from '../components/SignupActions'
import SortHeader from '../components/SortHeader'
import { useFacultyEvaluations } from '../hooks/useFacultyEvaluations'
import type { FacultyEvaluations } from '../hooks/useFacultyEvaluations'
import { useSignups } from '../hooks/useSignups'
import { useSortedRows } from '../hooks/useSortedRows'
import type { Comparators } from '../hooks/useSortedRows'
import { downloadCsv } from '../utils/csv'
import type { PageProps } from '../pageProps'

/** An observation from this professor's point of view. */
type Session = ProfessorObservation & { observedYou: boolean }

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

function clock(time: string) {
  const [h, m] = time.split(':').map(Number)
  return { text: `${h % 12 || 12}:${String(m).padStart(2, '0')}`, meridiem: h < 12 ? 'AM' : 'PM' }
}

/** "13:00", "14:15" → "1:00–2:15 PM"; "11:30", "12:45" → "11:30 AM–12:45 PM"; short drops AM/PM. */
function timeRange(start: string | null, end: string | null, short = false) {
  if (!start) return ''
  const a = clock(start)
  if (!end) return short ? a.text : `${a.text} ${a.meridiem}`
  const b = clock(end)
  if (short) return `${a.text}–${b.text}`
  return a.meridiem === b.meridiem ? `${a.text}–${b.text} ${b.meridiem}` : `${a.text} ${a.meridiem}–${b.text} ${b.meridiem}`
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function sessionsOf(data: FacultyEvaluations): Session[] {
  return [
    ...(data.observations?.received ?? []).map((o) => ({ ...o, observedYou: true })),
    ...(data.observations?.given ?? []).map((o) => ({ ...o, observedYou: false })),
  ]
}

const byDate = (a: Session, b: Session) => (a.observation_date ?? '').localeCompare(b.observation_date ?? '')

/** What this professor still has to do on an observation that already happened. */
function pendingAction(s: Session, today: string): 'fill' | 'sign' | null {
  if (s.locked || !s.observation_date || s.observation_date > today || !s.needs_my_signature) return null
  // The observer fills in the form; the observee signs once the observer has.
  if (!s.observedYou) return 'fill'
  return s.observer_signed ? 'sign' : null
}

function TeacherEvaluationsPage({ navigate }: PageProps) {
  const [showHistory, setShowHistory] = useState(false)
  const { cycle, signup, professorId, refresh } = useSignups()
  const data = useFacultyEvaluations(professorId, signup?.signup_id ?? null)
  const today = cycle?.today ?? localToday()

  const sessions = sessionsOf(data)
  const upcoming = sessions.filter((s) => (s.observation_date ?? '9999') >= today && !s.locked).sort(byDate)
  const completed = sessions.filter((s) => !upcoming.includes(s)).sort((a, b) => byDate(b, a))
  const openReport = (id: number) => navigate('Observation Report', String(id))
  const reload = () => {
    data.reload()
    refresh()
  }

  if (professorId === null) {
    return (
      <main className="min-w-0 flex-1 px-6 py-7">
        <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
        <p className="mt-4 text-sm text-neutral-700">This session isn’t linked to a professor.</p>
      </main>
    )
  }

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluations</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Your evaluation cycle, evaluations you receive, and evaluations you give · {cycle ? `${cycle.semester} ${cycle.year}` : '—'}
          </p>
          <SignupStatus />
          {data.error && <p className="mt-1 text-[11px] text-[#b3261e]">{data.error}</p>}
        </div>
        <div className="flex gap-2">
          <SignupActions />
        </div>
      </header>

      <div className="mt-5 space-y-4">
        <AttentionCard data={data} sessions={sessions} today={today} onOpenReport={openReport} />
        <StatsRow data={data} sessions={sessions} cycleId={cycle?.cycle_id ?? null} />
        {signup && (
          <RequestObserversCard
            key={`${signup.signup_id}-${data.sent?.requests.length ?? 0}`}
            signup={signup}
            professorId={professorId}
            observerList={data.observerList}
            sent={data.sent}
            onChanged={reload}
          />
        )}
        <IncomingRequestsCard professorId={professorId} incoming={data.incoming} accepted={data.accepted} onChanged={reload} />
        <SurveyCard professorId={professorId} surveys={data.surveys} onChanged={reload} />
        <UpcomingSessionsCard
          items={upcoming}
          loading={data.loading}
          onOpenReport={openReport}
          onOpenCalendar={() => navigate('Dashboard')}
        />
        <RecentlyCompletedCard
          items={completed}
          today={today}
          onOpenReport={openReport}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory((v) => !v)}
        />
        {showHistory && <HistoryCard sessions={sessions} onOpenReport={openReport} />}
      </div>
    </main>
  )
}

function AttentionCard({
  data,
  sessions,
  today,
  onOpenReport,
}: {
  data: FacultyEvaluations
  sessions: Session[]
  today: string
  onOpenReport: (id: number) => void
}) {
  const toFill = sessions.filter((s) => pendingAction(s, today) === 'fill').sort(byDate)
  const toSign = sessions.filter((s) => pendingAction(s, today) === 'sign').sort(byDate)
  const pendingRequests = data.incoming?.pending_count ?? 0
  const confirmed = data.sent?.signup_status === 'Requests Sent' ? (data.sent?.confirmed_count ?? 0) : 0
  const surveysDue =
    data.surveys?.window === 'open' ? data.surveys.surveys.filter((s) => !s.submitted).map((s) => s.role) : []
  const count = toFill.length + toSign.length + (pendingRequests ? 1 : 0) + (confirmed ? 1 : 0) + (surveysDue.length ? 1 : 0)
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
        {toFill.map((s) => (
          <AttentionItem
            key={`fill-${s.observation_id}`}
            tone="red"
            title={`Fill in and sign your report for ${s.observee_name}`}
            detail={`Observed ${s.course_code} Sec ${s.section_name} on ${format(s.observation_date!, { month: 'short', day: 'numeric' })}`}
          >
            <button type="button" onClick={() => onOpenReport(s.observation_id)} className={primary}>
              Open report
            </button>
          </AttentionItem>
        ))}
        {toSign.map((s) => (
          <AttentionItem
            key={`sign-${s.observation_id}`}
            tone="orange"
            title={`Review and sign ${s.observer_name}’s report`}
            detail={`Observed your ${s.course_code} Sec ${s.section_name} on ${format(s.observation_date!, { month: 'short', day: 'numeric' })}`}
          >
            <button type="button" onClick={() => onOpenReport(s.observation_id)} className={primary}>
              Review and sign
            </button>
          </AttentionItem>
        ))}
        {pendingRequests > 0 && (
          <AttentionItem
            tone="orange"
            title={`Answer ${pendingRequests} observation request${pendingRequests === 1 ? '' : 's'}`}
            detail="Colleagues asked you to observe their class. Requests expire after 48 hours."
          >
            <button type="button" onClick={() => scrollTo('observation-requests')} className={primary}>
              View requests
            </button>
          </AttentionItem>
        )}
        {confirmed > 0 && (
          <AttentionItem
            tone="orange"
            title="Choose your observer"
            detail={`${confirmed} observer${confirmed === 1 ? '' : 's'} confirmed your request.`}
          >
            <button type="button" onClick={() => window.scrollTo({ top: 0 })} className={primary}>
              Choose
            </button>
          </AttentionItem>
        )}
        {surveysDue.length > 0 && (
          <AttentionItem
            tone="orange"
            title="Take the post-observation survey"
            detail={`As the ${surveysDue.join(' and ').toLowerCase()} · due ${format(data.surveys!.due, { month: 'short', day: 'numeric' })}`}
          >
            <button type="button" onClick={() => scrollTo('post-observation-survey')} className={primary}>
              Take survey
            </button>
          </AttentionItem>
        )}
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

function StatsRow({ data, sessions, cycleId }: { data: FacultyEvaluations; sessions: Session[]; cycleId: number | null }) {
  const status = data.status
  const thisCycle = sessions.filter((s) => s.cycle_id === cycleId)
  const received = thisCycle.filter((s) => s.observedYou)
  const given = thisCycle.filter((s) => !s.observedYou)
  const signed = given.filter((s) => s.observer_signed).length
  const nextDue = status?.next_due_year ? `${status.next_due_semester ?? ''} ${status.next_due_year}`.trim() : '—'
  const frequency = status?.frequency_years
    ? `every ${status.frequency_years === 1 ? 'year' : `${status.frequency_years} years`}`
    : 'unknown'

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <StatCard label="Next formal evaluation" value={<span className="text-2xl">{nextDue}</span>}>
        {status ? `${status.status} · evaluated ${frequency}` : 'Evaluation status unavailable'}
      </StatCard>
      <StatCard
        label="Observations received"
        value={
          <>
            <span className="text-2xl">{received.length}</span>
            <span className="ml-1 text-xs font-normal text-neutral-600">this cycle</span>
          </>
        }
      >
        {received.filter((s) => s.locked).length} signed by both
      </StatCard>
      <StatCard
        label="Evaluations you give"
        value={
          <>
            <span className="text-2xl">{given.length}</span>
            <span className="ml-1 text-xs font-normal text-neutral-600">this cycle</span>
          </>
        }
      >
        {signed} report{signed === 1 ? '' : 's'} signed · {given.length - signed} to go
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

function DateBlock({ iso, boxed }: { iso: string | null; boxed?: boolean }) {
  return (
    <div
      className={`flex w-10 shrink-0 flex-col items-center justify-center ${boxed ? 'h-11 rounded-md border border-neutral-200 bg-white' : ''}`}
    >
      <span className={`text-[8px] font-semibold uppercase ${boxed ? 'text-[#c4561a]' : 'text-neutral-500'}`}>
        {iso ? format(iso, { month: 'short' }) : '—'}
      </span>
      <span className="text-sm leading-tight font-semibold text-neutral-900">{iso ? format(iso, { day: 'numeric' }) : ''}</span>
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

function sessionTitle(s: Session) {
  return s.observedYou
    ? `${s.observer_name} → your ${s.course_code} Sec ${s.section_name}`
    : `${s.observee_name} · ${s.course_code} Sec ${s.section_name}`
}

function UpcomingSessionsCard({
  items,
  loading,
  onOpenReport,
  onOpenCalendar,
}: {
  items: Session[]
  loading: boolean
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
        {items.map((s) => (
          <li key={s.observation_id} className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 px-3 py-2.5">
            <DateBlock iso={s.observation_date} boxed />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-900">
                <RoleChip observedYou={s.observedYou} past={false} />
                {sessionTitle(s)}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-neutral-500">
                {[s.observation_date && format(s.observation_date, { weekday: 'short' }), timeRange(s.start_time, s.end_time, true)]
                  .filter(Boolean)
                  .join(' ')}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#3f8a55]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3f8a55]" aria-hidden="true" />
                Scheduled
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => onOpenReport(s.observation_id)} className={secondary}>
                {s.observedYou ? 'View form' : 'Evaluation form'}
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-6 text-center text-[11px] text-neutral-500">{loading ? 'Loading…' : 'Nothing scheduled.'}</li>
        )}
      </ul>
    </section>
  )
}

function RecentlyCompletedCard({
  items,
  today,
  onOpenReport,
  showHistory,
  onToggleHistory,
}: {
  items: Session[]
  today: string
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
        {items.slice(0, 6).map((s) => {
          const action = pendingAction(s, today)
          return (
            <li key={s.observation_id} className="flex flex-wrap items-center gap-3 py-2.5">
              <DateBlock iso={s.observation_date} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-900">
                  <RoleChip observedYou={s.observedYou} past />
                  {sessionTitle(s)}
                </p>
                {action === 'fill' ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#b3261e]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#b3261e]" aria-hidden="true" />
                    Report not signed yet
                  </p>
                ) : action === 'sign' ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#c4561a]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#c4561a]" aria-hidden="true" />
                    Waiting for your signature
                  </p>
                ) : s.locked ? (
                  <p className="mt-0.5 text-[10px] text-[#3f8a55]">✓ Signed by both</p>
                ) : (
                  <p className="mt-0.5 text-[10px] text-neutral-500">
                    Waiting for {s.observedYou ? s.observer_name : s.observee_name} to sign
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenReport(s.observation_id)}
                  className={action ? primary : secondary}
                >
                  {action === 'fill' ? 'Fill in report' : action === 'sign' ? 'Review and sign' : 'View report'}
                </button>
              </div>
            </li>
          )
        })}
        {items.length === 0 && <li className="py-6 text-center text-[11px] text-neutral-500">Nothing completed yet.</li>}
      </ul>
    </section>
  )
}

const HISTORY_COMPARATORS: Comparators<Session, 'date' | 'type' | 'with' | 'status'> = {
  date: byDate,
  type: (a, b) => Number(a.observedYou) - Number(b.observedYou),
  with: (a, b) => sessionTitle(a).localeCompare(sessionTitle(b)),
  status: (a, b) => a.status.localeCompare(b.status),
}

function HistoryCard({ sessions, onOpenReport }: { sessions: Session[]; onOpenReport: (id: number) => void }) {
  const { sorted, sort, toggle } = useSortedRows(sessions, HISTORY_COMPARATORS, { key: 'date', dir: 'desc' })

  const exportHistory = () =>
    downloadCsv(
      'evaluation-history.csv',
      ['Date', 'Type', 'With / Course', 'Term', 'Status'],
      sorted.map((s) => [
        s.observation_date ?? '',
        s.observedYou ? 'Observed' : 'Observing',
        sessionTitle(s),
        `${s.semester} ${s.year}`,
        s.status,
      ]),
    )

  return (
    <section className={card}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">History</h2>
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
              <th className="px-2 py-1.5 text-left font-normal">Term</th>
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
              <th className="rounded-r px-2 py-1.5 text-left font-normal">Report</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.observation_id} className="border-b border-neutral-100">
                <td className="px-2 py-2 whitespace-nowrap text-neutral-900">
                  {s.observation_date ? format(s.observation_date, { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                      s.observedYou ? 'bg-[#e0791a] text-white' : 'bg-[#1c4532] text-white'
                    }`}
                  >
                    {s.observedYou ? 'Observed' : 'Observing'}
                  </span>
                </td>
                <td className="max-w-48 px-2 py-2 text-neutral-900">{sessionTitle(s)}</td>
                <td className="px-2 py-2 whitespace-nowrap text-neutral-700">
                  {s.semester} {s.year}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-neutral-700">{s.status}</td>
                <td className="px-2 py-2">
                  <button type="button" onClick={() => onOpenReport(s.observation_id)} className="text-[#c4561a] hover:underline">
                    View
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-neutral-500">
                  No observations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default TeacherEvaluationsPage
