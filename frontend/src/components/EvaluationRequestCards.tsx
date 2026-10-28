// The observer-request flow and the post-observation survey, from the process doc:
// observees send requests to observers on their saved list and pick one confirmed
// observer; observers confirm up to 3 requests; both take the survey afterwards.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from '../api/client'
import { acceptRequest, declineRequest, selectObserver, sendObserverRequests } from '../api/observerRequests'
import type { IncomingRequests, ObserverChoice, ObserverRequest, RequestStatus, SignupRequests } from '../api/observerRequests'
import type { ListedObserver } from '../api/observerSelection'
import type { ObserveeSignup } from '../api/signups'
import { submitSurvey } from '../api/surveys'
import type { ProfessorSurveys, SurveyRole } from '../api/surveys'

const secondary =
  'rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-neutral-900 transition-colors hover:bg-neutral-50 disabled:text-neutral-400 disabled:hover:bg-white'
const primary =
  'rounded-md bg-[#c4561a] px-3 py-1.5 text-[11px] font-medium whitespace-nowrap text-white transition-colors hover:bg-[#a9481a] disabled:opacity-50'
const card = 'min-w-0 rounded-lg border border-neutral-200 bg-white p-4'
const input =
  'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-[#1c4532] focus:outline-none'

const REQUEST_CHIPS: Record<RequestStatus, string> = {
  Pending: 'bg-[#fdf1e6] text-[#c4561a]',
  Accepted: 'bg-[#e3efe6] text-[#1c4532]',
  Declined: 'bg-neutral-100 text-neutral-600',
  'Not Selected': 'bg-neutral-100 text-neutral-600',
  Cancelled: 'bg-neutral-100 text-neutral-600',
  Expired: 'bg-neutral-100 text-neutral-600',
}

/** Declined or expired requests leave the observer free to be asked by someone else, not again by you. */
const CLOSED: RequestStatus[] = ['Declined', 'Expired', 'Not Selected', 'Cancelled']

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function clock(time: string) {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function classLine(r: Pick<ObserverRequest, 'course_code' | 'section_name' | 'meeting_days' | 'start_time' | 'end_time'>) {
  const time = r.start_time ? ` ${clock(r.start_time)}${r.end_time ? `–${clock(r.end_time)}` : ''}` : ''
  return `${r.course_code}.${r.section_name}${r.meeting_days ? ` · ${r.meeting_days}${time}` : ''}`
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

/** Runs an API action with a busy flag and an inline error. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorText(err, fallback))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[11px] text-[#b3261e]">
      {error}
    </p>
  )
}

function CardHeader({ title, detail, badge }: { title: string; detail?: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {detail && <p className="mt-0.5 text-[10px] text-neutral-500">{detail}</p>}
      </div>
      {badge}
    </div>
  )
}

function Chip({ status }: { status: RequestStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium whitespace-nowrap ${REQUEST_CHIPS[status]}`}>{status}</span>
}

/**
 * Observee side: send requests to observers on the saved list, then choose one
 * of the observers who confirmed. Choosing sends graceful declines to the others.
 */
export function RequestObserversCard({
  signup,
  professorId,
  observerList,
  sent,
  onChanged,
}: {
  signup: ObserveeSignup
  professorId: number
  observerList: ListedObserver[]
  sent: SignupRequests | null
  onChanged: () => void
}) {
  const requests = sent?.requests ?? []
  const status = sent?.signup_status ?? signup.status
  const firstSend = requests.length === 0
  const [picked, setPicked] = useState<Set<number>>(() => new Set())
  const [dates, setDates] = useState<string[]>(() => [...signup.preferred_dates].sort())
  const [newDate, setNewDate] = useState('')
  const [choice, setChoice] = useState<Record<number, string>>({})
  const [result, setResult] = useState<ObserverChoice | null>(null)
  const { busy, error, run } = useAction()

  const requestFor = (observerId: number) => requests.find((r) => r.observer_id === observerId)
  const confirmed = requests.filter((r) => r.status === 'Accepted')
  const chosen = requests.find((r) => r.observation_date !== null)
  const datesChanged = JSON.stringify(dates) !== JSON.stringify([...signup.preferred_dates].sort())

  const send = () =>
    run(async () => {
      await sendObserverRequests({
        signup_id: signup.signup_id,
        observee_id: professorId,
        observer_ids: [...picked],
        // Proposed dates can only be set with the first requests.
        ...(firstSend && datesChanged ? { proposed_dates: dates } : {}),
      })
      setPicked(new Set())
      onChanged()
    }, 'Sending requests failed')

  const choose = (r: ObserverRequest) =>
    run(async () => {
      const date = choice[r.request_id] ?? r.proposed_dates[0]
      setResult(
        await selectObserver(signup.signup_id, {
          observee_id: professorId,
          observer_id: r.observer_id,
          ...(date ? { observation_date: date } : {}),
        }),
      )
      onChanged()
    }, 'Choosing the observer failed')

  if (status === 'Pending' || status === 'Matched' || status === 'Unmatched') {
    return (
      <section className={card}>
        <CardHeader
          title="Your observers"
          detail={`${signup.course_code}.${signup.section_name} · signed up to be observed`}
        />
        <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-600">
          {status === 'Unmatched'
            ? 'No eligible observers were found for your class. The Assessment Committee has been alerted.'
            : 'Your list of possible observers isn’t ready yet. The Assessment Committee sends it after the signup deadline.'}
        </p>
      </section>
    )
  }

  if (chosen || status === 'Accepted') {
    return (
      <section className={card}>
        <CardHeader title="Your observer" detail={`${signup.course_code}.${signup.section_name}`} />
        {chosen && (
          <p className="mt-3 rounded-md bg-[#e3efe6] px-3 py-2.5 text-xs text-[#1c4532]">
            <span className="font-semibold">{chosen.observer_name}</span> will observe your class
            {chosen.observation_date ? ` on ${shortDate(chosen.observation_date)}` : ''}.
          </p>
        )}
        {result && (result.graceful_declines.length > 0 || result.withdrawn_requests.length > 0) && (
          <p className="mt-2 text-[10px] text-neutral-500">
            {result.graceful_declines.length > 0 &&
              `Thank-you notes sent to ${result.graceful_declines.map((d) => d.observer_name).join(', ')}. `}
            {result.withdrawn_requests.length > 0 &&
              `Withdrew unanswered requests to ${result.withdrawn_requests.map((d) => d.observer_name).join(', ')}.`}
          </p>
        )}
        <RequestList requests={requests.filter((r) => r !== chosen)} />
      </section>
    )
  }

  const canPick = (o: ListedObserver) => !requestFor(o.observer_id)

  return (
    <section className={card}>
      <CardHeader
        title="Request observers"
        detail={`${signup.course_code}.${signup.section_name} · choose who to ask from your list of possible observers`}
        badge={
          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-medium text-neutral-700">
            {confirmed.length} confirmed
          </span>
        }
      />

      {confirmed.length > 0 && (
        <div className="mt-3 rounded-md border border-[#cfe3d5] bg-[#f3f8f4] p-3">
          <p className="text-xs font-semibold text-neutral-900">Choose your observer</p>
          <p className="text-[10px] text-neutral-600">
            The others who confirmed get a thank-you note, and unanswered requests are withdrawn.
          </p>
          <ul className="mt-2 space-y-2">
            {confirmed.map((r) => (
              <li key={r.request_id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-xs text-neutral-900">{r.observer_name}</span>
                {r.proposed_dates.length > 1 && (
                  <select
                    aria-label={`Observation date with ${r.observer_name}`}
                    value={choice[r.request_id] ?? r.proposed_dates[0]}
                    onChange={(e) => setChoice((c) => ({ ...c, [r.request_id]: e.target.value }))}
                    className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px]"
                  >
                    {r.proposed_dates.map((d) => (
                      <option key={d} value={d}>
                        {shortDate(d)}
                      </option>
                    ))}
                  </select>
                )}
                {r.proposed_dates.length === 1 && (
                  <span className="text-[11px] text-neutral-600">{shortDate(r.proposed_dates[0])}</span>
                )}
                <button type="button" disabled={busy} onClick={() => choose(r)} className={primary}>
                  Choose
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {observerList.map((o) => {
          const request = requestFor(o.observer_id)
          return (
            <li key={o.observer_id} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                aria-label={`Request ${o.name}`}
                disabled={!canPick(o) || busy}
                checked={picked.has(o.observer_id)}
                onChange={(e) =>
                  setPicked((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(o.observer_id)
                    else next.delete(o.observer_id)
                    return next
                  })
                }
                className="accent-[#1c4532]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-neutral-900">{o.name}</p>
                <p className="text-[10px] text-neutral-500">{o.department}</p>
              </div>
              {request && <Chip status={request.status} />}
            </li>
          )
        })}
        {observerList.length === 0 && (
          <li className="px-3 py-4 text-center text-[11px] text-neutral-500">Your observer list is empty.</li>
        )}
      </ul>

      <div className="mt-3">
        <p className="text-[11px] font-medium text-neutral-900">Proposed dates</p>
        <p className="text-[10px] text-neutral-500">
          {firstSend
            ? 'Class days on or before the observation deadline. You can change these until you send your first request.'
            : 'Sent with your first requests.'}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {dates.map((d) => (
            <li key={d} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-800">
              {shortDate(d)}
              {firstSend && (
                <button
                  type="button"
                  aria-label={`Remove ${d}`}
                  onClick={() => setDates((prev) => prev.filter((x) => x !== d))}
                  className="text-neutral-400 hover:text-[#b3261e]"
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {dates.length === 0 && <li className="text-[10px] text-[#b3261e]">Add at least one date.</li>}
        </ul>
        {firstSend && (
          <div className="mt-1.5 flex gap-2">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="Add a proposed date"
              className="rounded-md border border-neutral-200 px-2 py-1 text-[11px]"
            />
            <button
              type="button"
              disabled={!newDate || dates.includes(newDate)}
              onClick={() => {
                setDates((prev) => [...prev, newDate].sort())
                setNewDate('')
              }}
              className={secondary}
            >
              Add date
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[10px] text-neutral-500">{picked.size} selected</span>
        <button type="button" disabled={busy || picked.size === 0 || dates.length === 0} onClick={send} className={primary}>
          Send {picked.size > 1 ? `${picked.size} requests` : 'request'}
        </button>
      </div>
      <ErrorLine error={error} />
    </section>
  )
}

function RequestList({ requests }: { requests: ObserverRequest[] }) {
  if (requests.length === 0) return null
  return (
    <ul className="mt-3 space-y-1.5">
      {requests.map((r) => (
        <li key={r.request_id} className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-700">
          <span className="font-medium text-neutral-900">{r.observer_name}</span>
          <Chip status={r.status} />
          {r.message && <span className="w-full text-[10px] text-neutral-500">{r.message}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Observer side: requests other observees sent, with confirm/decline (up to the cycle limit). */
export function IncomingRequestsCard({
  professorId,
  incoming,
  accepted,
  onChanged,
}: {
  professorId: number
  incoming: IncomingRequests | null
  accepted: (ObserverRequest & { selected: boolean })[]
  onChanged: () => void
}) {
  const { busy, error, run } = useAction()
  const requests = incoming?.requests ?? []
  const pending = requests.filter((r) => r.status === 'Pending')
  const closed = requests.filter((r) => CLOSED.includes(r.status))
  const full = incoming !== null && incoming.confirmed_count >= incoming.max_confirmations

  const respond = (r: ObserverRequest, accept: boolean) =>
    run(async () => {
      await (accept ? acceptRequest : declineRequest)(r.request_id, professorId)
      onChanged()
    }, accept ? 'Confirming failed' : 'Declining failed')

  return (
    <section id="observation-requests" className={card}>
      <CardHeader
        title="Observation requests"
        detail="Colleagues who asked you to observe their class. You can confirm up to 3 per cycle."
        badge={
          incoming && (
            <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-medium text-neutral-700">
              {incoming.confirmed_count} of {incoming.max_confirmations} confirmed
            </span>
          )
        }
      />

      <ul className="mt-3 space-y-2">
        {pending.map((r) => (
          <li key={r.request_id} className="flex flex-wrap items-center gap-3 rounded-md border border-[#f5d3b3] bg-[#fdf1e6] px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-neutral-900">{r.observee_name}</p>
              <p className="mt-0.5 text-[10px] text-neutral-600">{classLine(r)}</p>
              <p className="mt-0.5 text-[10px] text-neutral-600">
                Proposed: {r.proposed_dates.map(shortDate).join(', ') || '—'}
                {r.expires_at && ` · answer by ${shortDate(r.expires_at.slice(0, 10))}`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={busy} onClick={() => respond(r, false)} className={secondary}>
                Decline
              </button>
              <button
                type="button"
                disabled={busy || full}
                title={full ? 'You already confirmed the most requests allowed this cycle' : undefined}
                onClick={() => respond(r, true)}
                className={primary}
              >
                Confirm
              </button>
            </div>
          </li>
        ))}
        {pending.length === 0 && <li className="py-2 text-center text-[11px] text-neutral-500">No requests waiting for you.</li>}
      </ul>

      {accepted.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">Your confirmations</h3>
          <ul className="mt-1.5 space-y-1.5">
            {accepted.map((r) => (
              <li key={r.request_id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-medium text-neutral-900">{r.observee_name}</span>
                <span className="text-neutral-500">{classLine(r)}</span>
                <span className={r.selected ? 'text-[#3f8a55]' : 'text-[#c4561a]'}>
                  {r.selected
                    ? `Chosen · observing ${r.observation_date ? shortDate(r.observation_date) : ''}`
                    : 'Waiting for them to choose'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {closed.length > 0 && <RequestListForObserver requests={closed} />}
      <ErrorLine error={error} />
    </section>
  )
}

function RequestListForObserver({ requests }: { requests: ObserverRequest[] }) {
  return (
    <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-2">
      {requests.map((r) => (
        <li key={r.request_id} className="text-[10px] text-neutral-500">
          <span className="font-medium text-neutral-700">{r.observee_name}</span> · {r.course_code}.{r.section_name} ·{' '}
          {r.message ?? r.status}
        </li>
      ))}
    </ul>
  )
}

/** Post-observation survey for each role the professor had this cycle. */
export function SurveyCard({
  professorId,
  surveys,
  onChanged,
}: {
  professorId: number
  surveys: ProfessorSurveys | null
  onChanged: () => void
}) {
  if (!surveys || surveys.surveys.length === 0) return null
  return (
    <section id="post-observation-survey" className={card}>
      <CardHeader
        title="Post-observation survey"
        detail={
          surveys.window === 'not_open_yet'
            ? `Opens after the observation deadline (${shortDate(surveys.opens_after)})`
            : surveys.window === 'open'
              ? `Open until ${shortDate(surveys.due)}`
              : `Closed on ${shortDate(surveys.due)}`
        }
      />
      <div className="mt-3 space-y-3">
        {surveys.surveys.map((s) =>
          s.submitted && s.response ? (
            <div key={s.role} className="rounded-md bg-[#e3efe6] px-3 py-2.5 text-[11px] text-[#1c4532]">
              <p className="font-semibold">
                {s.role} survey submitted{s.response.submitted_at ? ` · ${shortDate(s.response.submitted_at.slice(0, 10))}` : ''}
              </p>
              <p className="mt-0.5">Process was {s.response.process_ok ? 'OK' : 'not OK'}.</p>
            </div>
          ) : surveys.window === 'open' ? (
            <SurveyForm key={s.role} role={s.role} professorId={professorId} onSubmitted={onChanged} />
          ) : (
            <p key={s.role} className="text-[11px] text-neutral-500">
              {s.role} survey · {surveys.window === 'closed' ? 'not submitted' : 'not open yet'}
            </p>
          ),
        )}
      </div>
    </section>
  )
}

function SurveyForm({ role, professorId, onSubmitted }: { role: SurveyRole; professorId: number; onSubmitted: () => void }) {
  const [processOk, setProcessOk] = useState<boolean | null>(null)
  const [difficulties, setDifficulties] = useState('')
  const [improvements, setImprovements] = useState('')
  const { busy, error, run } = useAction()

  const submit = () =>
    run(async () => {
      await submitSurvey({
        professor_id: professorId,
        role,
        process_ok: processOk!,
        difficulties: difficulties.trim() || undefined,
        improvements: improvements.trim() || undefined,
      })
      onSubmitted()
    }, 'Submitting the survey failed')

  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <p className="text-xs font-semibold text-neutral-900">As the {role.toLowerCase()}</p>
      <fieldset className="mt-2">
        <legend className="text-[11px] text-neutral-700">Was this process OK?</legend>
        <div className="mt-1 flex gap-2">
          {[true, false].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={processOk === value}
              onClick={() => setProcessOk(value)}
              className={`rounded-md border px-3 py-1 text-[11px] ${
                processOk === value ? 'border-[#1c4532] bg-[#1c4532] text-white' : 'border-neutral-200 bg-white text-neutral-800'
              }`}
            >
              {value ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="mt-2 block text-[11px] text-neutral-700">
        Difficulties you had
        <textarea rows={2} value={difficulties} onChange={(e) => setDifficulties(e.target.value)} className={`mt-1 ${input}`} />
      </label>
      <label className="mt-2 block text-[11px] text-neutral-700">
        How could the process improve?
        <textarea rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)} className={`mt-1 ${input}`} />
      </label>
      {role === 'Observee' && (
        <p className="mt-2 text-[10px] text-neutral-500">
          Uploading a file about trouble during the observation isn’t available yet: the backend has no upload endpoint.
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={busy || processOk === null} onClick={submit} className={primary}>
          Submit survey
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  )
}
