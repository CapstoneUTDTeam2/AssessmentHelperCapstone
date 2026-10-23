import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CRITERIA, CURRENT_CYCLE, RATING_SCALE, SECTIONS } from '../data/criteriaMock'
import type { Criterion } from '../data/criteriaMock'
import { RECEIVED_REPORTS, TEACHER_PROFILE, UPCOMING } from '../data/teacherMock'
import type { ReceivedReport, ReportRating as Rating, UpcomingEvaluation } from '../data/teacherMock'
import type { PageProps } from '../pageProps'
import { formatTime, fromIso } from '../utils/calendar'
import { loadSignoff, storeSignoff } from '../utils/signoffs'
import type { Signoff } from '../utils/signoffs'

// Ratings come from the same scale the AC edits on the Evaluation Criteria page.
const RATINGS = RATING_SCALE.map((r) => ({ value: r.label.split(' · ')[0] as Rating, label: r.label, tone: r.tone }))

const RATING_SELECTED = {
  green: 'border-[#1c4532] bg-[#1c4532] text-white',
  orange: 'border-[#c4561a] bg-[#c4561a] text-white',
  neutral: 'border-neutral-600 bg-neutral-600 text-white',
}

/** Ratings that require an "opportunities for growth" note when the criterion asks for one. */
const LOW_RATINGS: Rating[] = ['2', '1']

interface CriterionNotes {
  practice: string
  growth: string
}

interface Draft {
  courseTitle: string
  date: string
  ratings: Record<number, Rating>
  notes: Record<number, CriterionNotes>
  strengths: string
  growth: string
  confirmed: boolean
  submitted: boolean
}

const draftKey = (id: number) => `assessment-helper-report-${id}`

// Drafts are a per-browser convenience until the report API exists.
function loadDraft(id: number): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(id))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function storeDraft(id: number, draft: Draft) {
  try {
    sessionStorage.setItem(draftKey(id), JSON.stringify(draft))
  } catch {
    // Storage unavailable; the draft just won't survive leaving the page.
  }
}

function newDraft(session: UpcomingEvaluation): Draft {
  const [subject, number, ...title] = session.course.split(' ')
  return {
    courseTitle: `${subject} ${number}.${session.section} ${title.join(' ')}`,
    date: session.date,
    ratings: {},
    notes: {},
    strengths: '',
    growth: '',
    confirmed: false,
    submitted: false,
  }
}

function longDate(iso: string) {
  return fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function shortDate(iso: string) {
  return fromIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/** Same criteria, order, and numbering as the AC's Evaluation Criteria page. */
function reportCriteria() {
  return SECTIONS.flatMap((s) => CRITERIA.filter((c) => c.active && c.sectionId === s.id))
}

const input =
  'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 read-only:text-neutral-600 focus:bg-white'
const card = 'rounded-lg border border-neutral-200 bg-white p-4'

function ObservationReportPage({ navigate, param }: PageProps) {
  const session = UPCOMING.find((u) => String(u.id) === param)
  const onBack = () => navigate('Evaluations')
  // You write reports for classes you observe, and review and sign reports on your own classes.
  if (session?.kind === 'Observing') return <ReportForm key={session.id} session={session} onBack={onBack} />
  const received = session && RECEIVED_REPORTS[session.id]
  if (session && received) return <ObserveeReview key={session.id} session={session} report={received} onBack={onBack} />
  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <BackLink onClick={onBack} />
      <p className="mt-6 text-sm text-neutral-700">That observation couldn’t be found.</p>
    </main>
  )
}

function ReportForm({ session, onBack }: { session: UpcomingEvaluation; onBack: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(session.id) ?? newDraft(session))
  const [openNotes, setOpenNotes] = useState<Set<number>>(() => new Set(Object.keys(draft.notes).map(Number)))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  const criteria = useMemo(() => reportCriteria(), [])
  const ratedCount = criteria.filter((c) => draft.ratings[c.id]).length
  const locked = draft.submitted
  const today = todayLabel()

  const needsGrowthNote = (c: Criterion) =>
    c.notesOnLowRating && LOW_RATINGS.includes(draft.ratings[c.id]) && !draft.notes[c.id]?.growth.trim()

  const problems = [
    ratedCount < criteria.length && `Rate every criterion (${criteria.length - ratedCount} left) · use N/A for anything not observed`,
    criteria.some(needsGrowthNote) && 'Add an opportunity for growth to every criterion rated 1 or 2',
    !draft.confirmed && 'Check the box to sign the report',
  ].filter(Boolean) as string[]

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const setRating = (id: number, rating: Rating) => {
    update({ ratings: { ...draft.ratings, [id]: rating } })
    if (LOW_RATINGS.includes(rating)) setOpenNotes((prev) => new Set(prev).add(id))
  }

  const setNote = (id: number, key: keyof CriterionNotes, value: string) =>
    update({ notes: { ...draft.notes, [id]: { ...(draft.notes[id] ?? { practice: '', growth: '' }), [key]: value } } })

  const saveDraft = () => {
    storeDraft(session.id, draft)
    setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
  }

  const submit = () => {
    if (problems.length > 0) {
      setShowErrors(true)
      document.getElementById('report-problems')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const submitted = { ...draft, submitted: true }
    setDraft(submitted)
    storeDraft(session.id, submitted)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const step = locked ? 1 : 0
  const steps = [
    { title: 'Draft', detail: 'You' },
    { title: 'Faculty reviews', detail: session.otherProfessor },
    { title: 'Complete', detail: 'Locked once both sign' },
  ]

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BackLink onClick={onBack} />
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">Observation report</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Observing {session.otherProfessor} · {session.course.split(' ').slice(0, 2).join(' ')} Sec {session.section} ·{' '}
            {longDate(session.date)} · {formatTime(session.start)}–{formatTime(session.end)}
            {session.room && ` · ${session.room}`}
          </p>
        </div>
        {!locked && (
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-[11px] text-neutral-500">Draft saved at {savedAt}</span>}
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={submit}
              className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
            >
              Submit and sign
            </button>
          </div>
        )}
      </header>

      <Steps steps={steps} current={step} />

      {locked && (
        <div className="mt-4 rounded-lg bg-[#e3efe6] px-4 py-3 text-xs text-[#1c4532]">
          <p className="font-medium">Submitted and signed</p>
          <p className="mt-0.5 text-[11px]">
            {session.otherProfessor} has been notified to review and sign. The report locks once you’ve both signed.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <section className={card}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Class details</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">Filled in from the scheduled session · edit only if something changed</p>
            </div>
            <span className="rounded-full bg-[#e3efe6] px-2 py-0.5 text-[10px] text-[#1c4532]">Auto-filled</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Faculty observed">
              <input readOnly value={session.otherProfessor} className={input} />
            </Field>
            <Field label="Course, section and title">
              <input
                readOnly={locked}
                value={draft.courseTitle}
                onChange={(e) => update({ courseTitle: e.target.value })}
                className={input}
              />
            </Field>
            <Field label="Semester">
              <input readOnly value={CURRENT_CYCLE} className={input} />
            </Field>
            <Field label="Date of observation">
              <input type="date" readOnly={locked} value={draft.date} onChange={(e) => update({ date: e.target.value })} className={input} />
            </Field>
            <Field label="Observer">
              <input readOnly value={`${TEACHER_PROFILE.name} (you)`} className={input} />
            </Field>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Observation criteria</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {RATINGS.map((r) => (r.value === 'N/A' ? 'N/A not observed (not scored)' : r.label.replace(' · ', ' '))).join(' · ')}
              </p>
            </div>
            <div className="w-32 text-right">
              <p className="text-[11px] font-medium text-neutral-900">
                {ratedCount} of {criteria.length} rated
              </p>
              <div className="mt-1 h-1 rounded-full bg-neutral-100">
                <div className="h-1 rounded-full bg-[#1c4532] transition-[width]" style={{ width: `${(ratedCount / criteria.length) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-2">
            {SECTIONS.map((s) => {
              const inSection = criteria.filter((c) => c.sectionId === s.id)
              if (inSection.length === 0) return null
              return (
                <div key={s.id}>
                  <h3 className="mt-3 border-b border-neutral-100 pb-1.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                    {s.name}
                  </h3>
                  <ol className="divide-y divide-neutral-100">
                    {inSection.map((c) => (
                      <CriterionRow
                        key={c.id}
                        number={criteria.indexOf(c) + 1}
                        criterion={c}
                        rating={draft.ratings[c.id]}
                        notes={draft.notes[c.id]}
                        notesOpen={openNotes.has(c.id)}
                        locked={locked}
                        missingRating={showErrors && !draft.ratings[c.id]}
                        missingGrowth={showErrors && needsGrowthNote(c)}
                        onRate={(r) => setRating(c.id, r)}
                        onOpenNotes={() => setOpenNotes((prev) => new Set(prev).add(c.id))}
                        onNote={(key, value) => setNote(c.id, key, value)}
                      />
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Summary</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Overall strengths observed">
              <textarea
                rows={4}
                readOnly={locked}
                value={draft.strengths}
                onChange={(e) => update({ strengths: e.target.value })}
                placeholder="Write a short summary…"
                className={input}
              />
            </Field>
            <Field label="Overall areas for growth">
              <textarea
                rows={4}
                readOnly={locked}
                value={draft.growth}
                onChange={(e) => update({ growth: e.target.value })}
                placeholder="Write a short summary…"
                className={input}
              />
            </Field>
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Electronic signatures</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            No paper copies — each person signs in Assessment Helper and is notified when it is their turn
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SignerCard
              role="Observer"
              name={`${TEACHER_PROFILE.name} (you)`}
              detail={locked ? `Signed ${today}` : 'Signs when you click Submit and sign'}
              status={locked ? 'Signed' : 'Ready to sign'}
              active={!locked}
            />
            <SignerCard
              role="Faculty observed"
              name={session.otherProfessor}
              detail="Reviews the report, acknowledges it, and can add a response"
              status={locked ? 'Ready to sign' : 'Waiting'}
              active={locked}
            />
          </div>

          {!locked && (
            <>
              <label className="mt-4 flex items-start gap-2 text-xs text-neutral-900">
                <input
                  type="checkbox"
                  checked={draft.confirmed}
                  onChange={(e) => update({ confirmed: e.target.checked })}
                  className="mt-0.5 accent-[#1c4532]"
                />
                I confirm this report reflects my observation. Checking this box is my electronic signature.
              </label>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Date" className="w-36">
                  <input readOnly value={today} className={input} />
                </Field>
                <button
                  type="button"
                  onClick={submit}
                  className="ml-auto rounded-md bg-[#e0791a] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
                >
                  Submit and sign
                </button>
              </div>
              {showErrors && problems.length > 0 && (
                <div id="report-problems" role="alert" className="mt-3 rounded-md bg-[#fbe8d6] px-3 py-2.5 text-[11px] text-[#8a3d12]">
                  <p className="font-medium">Before you can submit:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function ObserveeReview({
  session,
  report,
  onBack,
}: {
  session: UpcomingEvaluation
  report: ReceivedReport
  onBack: () => void
}) {
  const [signoff, setSignoff] = useState<Signoff | null>(() => loadSignoff(session.id))
  const [reviewed, setReviewed] = useState(false)
  const [response, setResponse] = useState('')
  const criteria = useMemo(() => reportCriteria(), [])

  const sign = () => {
    const signed = { signedOn: new Date().toISOString().slice(0, 10), response: response.trim() }
    storeSignoff(session.id, signed)
    setSignoff(signed)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const steps = [
    { title: 'Observer signs', detail: session.otherProfessor },
    { title: 'You review and sign', detail: 'You' },
    { title: 'Complete', detail: 'Locked once both sign' },
  ]

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header>
        <BackLink onClick={onBack} />
        <h1 className="mt-1 text-xl font-semibold text-neutral-900">Observation report</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Observed by {session.otherProfessor} · {session.course.split(' ').slice(0, 2).join(' ')} Sec {session.section} ·{' '}
          {longDate(session.date)} · {formatTime(session.start)}–{formatTime(session.end)}
          {session.room && ` · ${session.room}`}
        </p>
      </header>

      <Steps steps={steps} current={signoff ? steps.length : 1} />

      {signoff && (
        <div className="mt-4 rounded-lg bg-[#e3efe6] px-4 py-3 text-xs text-[#1c4532]">
          <p className="font-medium">Signed · report complete</p>
          <p className="mt-0.5 text-[11px]">You and {session.otherProfessor} have both signed. The report is now locked.</p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Summary</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[11px] text-neutral-600">Overall strengths observed</p>
              <p className="mt-1 text-xs text-neutral-900">{report.strengths}</p>
            </div>
            <div>
              <p className="text-[11px] text-neutral-600">Overall areas for growth</p>
              <p className="mt-1 text-xs text-neutral-900">{report.growth}</p>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Ratings</h2>
          {SECTIONS.map((s) => {
            const inSection = criteria.filter((c) => c.sectionId === s.id)
            if (inSection.length === 0) return null
            return (
              <div key={s.id}>
                <h3 className="mt-3 border-b border-neutral-100 pb-1.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                  {s.name}
                </h3>
                <ol className="divide-y divide-neutral-100">
                  {inSection.map((c) => {
                    const rating = RATINGS.find((r) => r.value === report.ratings[c.id])
                    return (
                      <li key={c.id} className="flex items-start gap-3 py-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#fbe8d6] text-[10px] font-medium text-[#c4561a]">
                          {criteria.indexOf(c) + 1}
                        </span>
                        <p className="min-w-0 flex-1 text-xs text-neutral-900">{c.text}</p>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${
                            rating ? RATING_SELECTED[rating.tone] : 'border-neutral-200 text-neutral-400'
                          }`}
                        >
                          {rating?.label ?? 'Not rated'}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )
          })}
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Electronic signatures</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Signing confirms you have read the report, not that you agree with it. Use the response box to add your side.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SignerCard
              role="Observer"
              name={session.otherProfessor}
              detail={`Signed ${shortDate(report.observerSignedOn)}`}
              status="Signed"
              active={false}
            />
            <SignerCard
              role="Faculty observed"
              name={`${TEACHER_PROFILE.name} (you)`}
              detail={signoff ? `Signed ${shortDate(signoff.signedOn)}` : 'Check the box below to sign'}
              status={signoff ? 'Signed' : 'Ready to sign'}
              active={!signoff}
            />
          </div>

          {signoff ? (
            signoff.response && (
              <div className="mt-4">
                <p className="text-[11px] text-neutral-600">Your response</p>
                <p className="mt-1 text-xs text-neutral-900">{signoff.response}</p>
              </div>
            )
          ) : (
            <>
              <Field label="Your response (optional)" className="mt-4">
                <textarea
                  rows={3}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Add any comments for the Assessment Committee…"
                  className={input}
                />
              </Field>
              <label className="mt-4 flex items-start gap-2 text-xs text-neutral-900">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                  className="mt-0.5 accent-[#1c4532]"
                />
                I have reviewed this report. Checking this box is my electronic signature.
              </label>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Date" className="w-36">
                  <input readOnly value={todayLabel()} className={input} />
                </Field>
                <button
                  type="button"
                  onClick={sign}
                  disabled={!reviewed}
                  className="ml-auto rounded-md bg-[#e0791a] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:bg-neutral-300"
                >
                  Sign report
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function Steps({ steps, current }: { steps: { title: string; detail: string }[]; current: number }) {
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-2" aria-label="Report status">
      {steps.map((s, i) => (
        <li key={s.title} className="flex items-center gap-2">
          {i > 0 && <span className="h-px w-6 bg-neutral-300" aria-hidden="true" />}
          <span
            aria-current={i === current ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 ${
              i === current ? 'border-[#e0791a] bg-[#e0791a] text-white' : 'border-neutral-200 bg-white text-neutral-900'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                i === current ? 'bg-white text-[#e0791a]' : i < current ? 'bg-[#1c4532] text-white' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </span>
            <span className="leading-tight">
              <span className="block text-[11px] font-medium">{s.title}</span>
              <span className={`block text-[9px] ${i === current ? 'text-white/80' : 'text-neutral-500'}`}>{s.detail}</span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function CriterionRow({
  number,
  criterion,
  rating,
  notes,
  notesOpen,
  locked,
  missingRating,
  missingGrowth,
  onRate,
  onOpenNotes,
  onNote,
}: {
  number: number
  criterion: Criterion
  rating: Rating | undefined
  notes: CriterionNotes | undefined
  notesOpen: boolean
  locked: boolean
  missingRating: boolean
  missingGrowth: boolean
  onRate: (r: Rating) => void
  onOpenNotes: () => void
  onNote: (key: keyof CriterionNotes, value: string) => void
}) {
  const growthRequired = criterion.notesOnLowRating && rating !== undefined && LOW_RATINGS.includes(rating)
  const labelId = `criterion-${criterion.id}`

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#fbe8d6] text-[10px] font-medium text-[#c4561a]">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-xs text-neutral-900">
            {criterion.text}
          </p>
          {criterion.points.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-neutral-500">
              {criterion.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {criterion.guidance && <p className="mt-1 text-[11px] text-neutral-500 italic">{criterion.guidance}</p>}
          {missingRating && <p className="mt-1 text-[11px] text-[#b3261e]">Choose a rating or N/A</p>}
        </div>
        <div role="radiogroup" aria-labelledby={labelId} className="flex gap-1">
          {RATINGS.map((r) => {
            const selected = rating === r.value
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={r.label}
                title={r.label}
                disabled={locked}
                onClick={() => onRate(r.value)}
                className={`h-7 rounded border text-[11px] transition-colors ${r.value === 'N/A' ? 'w-9' : 'w-7'} ${
                  selected ? RATING_SELECTED[r.tone] : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                } disabled:cursor-default ${missingRating ? 'border-[#b3261e]/50' : ''}`}
              >
                {r.value}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pl-8">
        {notesOpen || growthRequired ? (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <Field label="Successful or effective practice">
              <textarea
                rows={2}
                readOnly={locked}
                value={notes?.practice ?? ''}
                onChange={(e) => onNote('practice', e.target.value)}
                className={input}
              />
            </Field>
            <Field
              label={growthRequired ? 'Opportunities for growth · required for 1–2' : 'Opportunities for growth'}
              tone={growthRequired ? 'warn' : undefined}
            >
              <textarea
                rows={2}
                readOnly={locked}
                value={notes?.growth ?? ''}
                onChange={(e) => onNote('growth', e.target.value)}
                className={`${input} ${growthRequired ? 'border-[#e0791a]' : ''} ${missingGrowth ? 'border-[#b3261e]' : ''}`}
              />
            </Field>
          </div>
        ) : (
          !locked && (
            <button type="button" onClick={onOpenNotes} className="mt-1 text-[11px] text-[#e0791a] hover:underline">
              + Add notes
            </button>
          )
        )}
      </div>
    </li>
  )
}

function Field({
  label,
  children,
  className = '',
  tone,
}: {
  label: string
  children: ReactNode
  className?: string
  tone?: 'warn'
}) {
  return (
    <label className={`block ${className}`}>
      <span className={`mb-1 block text-[11px] ${tone === 'warn' ? 'text-[#c4561a]' : 'text-neutral-600'}`}>{label}</span>
      {children}
    </label>
  )
}

function SignerCard({
  role,
  name,
  detail,
  status,
  active,
}: {
  role: string
  name: string
  detail: string
  status: string
  active: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${active ? 'border-[#e0791a]' : 'border-neutral-200 bg-neutral-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium tracking-wide text-neutral-500 uppercase">{role}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] ${
            status === 'Signed'
              ? 'bg-[#1c4532] text-white'
              : active
                ? 'bg-[#e0791a] text-white'
                : 'border border-neutral-200 bg-white text-neutral-500'
          }`}
        >
          {status}
        </span>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-neutral-900">{name}</p>
      <p className="mt-0.5 text-[11px] text-neutral-500">{detail}</p>
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-[#e0791a] hover:underline">
      ← Back to Evaluations
    </button>
  )
}

export default ObservationReportPage
