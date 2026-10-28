import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError } from '../api/client'
import { getObservation, NOT_APPLICABLE, saveRatings, signObservation } from '../api/observations'
import type { ObservationCriterion, ObservationReport, RatingOption } from '../api/observations'
import { getTemplate } from '../api/templates'
import type { TemplateSection } from '../api/templates'
import { loggedInUser } from '../auth/session'
import type { PageProps } from '../pageProps'
import { formatTime, fromIso } from '../utils/calendar'

type Tone = 'green' | 'orange' | 'neutral'

const RATING_SELECTED: Record<Tone, string> = {
  green: 'border-[#1c4532] bg-[#1c4532] text-white',
  orange: 'border-[#c4561a] bg-[#c4561a] text-white',
  neutral: 'border-neutral-600 bg-neutral-600 text-white',
}

/** Ratings that need a comment when the criterion asks for one (same rule as the backend). */
const LOW_RATINGS = [1, 2]

function ratingTone(value: number): Tone {
  if (value === NOT_APPLICABLE) return 'neutral'
  return LOW_RATINGS.includes(value) ? 'orange' : 'green'
}

function ratingShort(value: number) {
  return value === NOT_APPLICABLE ? 'N/A' : String(value)
}

function ratingLabel(scale: RatingOption[], value: number | null) {
  const option = scale.find((r) => r.value === value)
  if (!option) return null
  return option.value === NOT_APPLICABLE ? option.label : `${option.value} · ${option.label}`
}

function longDate(iso: string) {
  return fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

/** Criteria grouped under the template's sections, in form order; unsectioned criteria go last. */
function groupCriteria(criteria: ObservationCriterion[], sections: TemplateSection[]) {
  const ordered = [...sections].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const groups = ordered
    .map((s) => ({ key: String(s.section_id), name: s.name, criteria: criteria.filter((c) => c.section_id === s.section_id) }))
    .filter((g) => g.criteria.length > 0)
  const known = new Set(sections.map((s) => s.section_id))
  const rest = criteria.filter((c) => c.section_id === null || !known.has(c.section_id))
  if (rest.length > 0) groups.push({ key: 'other', name: groups.length ? 'Other criteria' : 'Criteria', criteria: rest })
  return groups
}

const input =
  'w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 read-only:text-neutral-600 focus:bg-white'
const card = 'rounded-lg border border-neutral-200 bg-white p-4'

function ObservationReportPage({ navigate, param }: PageProps) {
  const user = loggedInUser()
  const backTo = user?.role === 'coordinator' ? 'Reports' : 'Evaluations'
  const onBack = () => navigate(backTo)
  const observationId = Number(param)
  const validId = Number.isInteger(observationId) && observationId > 0
  const [report, setReport] = useState<ObservationReport | null>(null)
  const [sections, setSections] = useState<TemplateSection[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!validId) return
    const controller = new AbortController()
    getObservation(observationId, controller.signal)
      .then(async (body) => {
        setReport(body)
        const template = await getTemplate(body.template_id, controller.signal).catch(() => null)
        if (template) setSections(template.sections)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err, 'Failed to load the observation'))
      })
    return () => controller.abort()
  }, [observationId, validId])

  if (!validId || error || !report) {
    return (
      <main className="min-w-0 flex-1 px-6 py-7">
        <BackLink label={backTo} onClick={onBack} />
        <p className="mt-6 text-sm text-neutral-700">
          {!validId ? 'That observation couldn’t be found.' : (error ?? 'Loading observation…')}
        </p>
      </main>
    )
  }

  const me = user?.professorId
  const role = me === report.observer_id ? 'observer' : me === report.observee_id ? 'observee' : 'viewer'
  return (
    <Report
      key={report.observation_id}
      report={report}
      sections={sections}
      role={role}
      professorId={me ?? null}
      backTo={backTo}
      onBack={onBack}
      onChange={setReport}
    />
  )
}

interface Draft {
  ratings: Record<number, number | null>
  comments: Record<number, string>
  summary: string
}

function draftFrom(report: ObservationReport): Draft {
  return {
    ratings: Object.fromEntries(report.criteria.map((c) => [c.criterion_id, c.rating])),
    comments: Object.fromEntries(report.criteria.map((c) => [c.criterion_id, c.comment ?? ''])),
    summary: report.summary ?? '',
  }
}

function Report({
  report,
  sections,
  role,
  professorId,
  backTo,
  onBack,
  onChange,
}: {
  report: ObservationReport
  sections: TemplateSection[]
  role: 'observer' | 'observee' | 'viewer'
  professorId: number | null
  backTo: string
  onBack: () => void
  onChange: (report: ObservationReport) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(report))
  const [confirmed, setConfirmed] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const anySigned = report.observer_signed || report.observee_signed
  // The backend locks ratings once anyone signs.
  const editable = role === 'observer' && !anySigned && !report.locked
  const mySignature = role === 'observer' ? report.observer_signed : role === 'observee' ? report.observee_signed : true
  const canSign = role !== 'viewer' && !mySignature && !report.locked
  const happened = report.observation_date !== null && report.observation_date <= todayIso()
  const groups = groupCriteria(report.criteria, sections)
  const criteria = groups.flatMap((g) => g.criteria)
  const ratedCount = criteria.filter((c) => draft.ratings[c.criterion_id] != null).length

  const needsComment = (c: ObservationCriterion) => {
    const rating = draft.ratings[c.criterion_id]
    return c.notes_on_low_rating && rating != null && LOW_RATINGS.includes(rating) && !draft.comments[c.criterion_id]?.trim()
  }
  const missingRating = (c: ObservationCriterion) => c.is_required && draft.ratings[c.criterion_id] == null

  const problems = [
    !happened &&
      `You can sign once the observation has happened (${report.observation_date ? longDate(report.observation_date) : 'no date yet'})`,
    editable && criteria.some(missingRating) && 'Rate every required criterion · use N/A for anything not observed',
    editable && criteria.some(needsComment) && 'Add a comment to every criterion rated 1 or 2',
    // The observee signs the observer's form as it is, so it must be finished first.
    !editable && report.missing.length > 0 && `The form isn’t finished yet: ${report.missing.join('; ')}`,
    !confirmed && 'Check the box to sign',
  ].filter(Boolean) as string[]

  const ratingsBody = () => ({
    observer_id: professorId!,
    ratings: criteria.map((c) => ({
      criterion_id: c.criterion_id,
      rating: draft.ratings[c.criterion_id] ?? null,
      comment: draft.comments[c.criterion_id]?.trim() || null,
    })),
    summary: draft.summary,
  })

  const saveDraft = async () => {
    setBusy(true)
    setError(null)
    try {
      onChange(await saveRatings(report.observation_id, ratingsBody()))
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    } catch (err) {
      setError(errorText(err, 'Saving failed'))
    } finally {
      setBusy(false)
    }
  }

  const sign = async () => {
    if (problems.length > 0) {
      setShowErrors(true)
      document.getElementById('report-problems')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (editable) await saveRatings(report.observation_id, ratingsBody())
      onChange(await signObservation(report.observation_id, professorId!))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(errorText(err, 'Signing failed'))
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    { title: 'Observer fills in the form', detail: report.observer_name },
    { title: 'Both sign', detail: 'Observer and observee' },
    { title: 'Complete', detail: 'Locked once both sign' },
  ]
  const step = report.locked ? steps.length : anySigned ? 1 : 0
  const you = (name: string, id: number) => (id === professorId ? `${name} (you)` : name)
  const course = `${report.course_code} Sec ${report.section_name}`
  const time = report.start_time
    ? ` · ${formatTime(report.start_time)}${report.end_time ? `–${formatTime(report.end_time)}` : ''}`
    : ''

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <BackLink label={backTo} onClick={onBack} />
          <h1 className="mt-1 text-xl font-semibold text-neutral-900">Observation report</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {role === 'observer'
              ? `Observing ${report.observee_name}`
              : role === 'observee'
                ? `Observed by ${report.observer_name}`
                : `${report.observer_name} observing ${report.observee_name}`}{' '}
            · {course} · {report.observation_date ? longDate(report.observation_date) : 'No date'}
            {time}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-[11px] text-neutral-500">Saved at {savedAt}</span>}
            <button
              type="button"
              onClick={saveDraft}
              disabled={busy}
              className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-60"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={sign}
              disabled={busy}
              className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-60"
            >
              Save and sign
            </button>
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[11px] text-[#b3261e]">
          {error}
        </p>
      )}

      <Steps steps={steps} current={step} />

      {report.locked ? (
        <div className="mt-4 rounded-lg bg-[#e3efe6] px-4 py-3 text-xs text-[#1c4532]">
          <p className="font-medium">Signed by both · report complete</p>
          <p className="mt-0.5 text-[11px]">
            The report is locked{report.completed_at ? ` since ${longDate(report.completed_at.slice(0, 10))}` : ''}.
          </p>
        </div>
      ) : (
        anySigned && (
          <div className="mt-4 rounded-lg bg-[#fdf1e6] px-4 py-3 text-xs text-[#8a3d12]">
            <p className="font-medium">Signed by {report.observer_signed ? report.observer_name : report.observee_name}</p>
            <p className="mt-0.5 text-[11px]">
              Ratings can’t change now. Waiting on {report.observer_signed ? report.observee_name : report.observer_name} to
              sign.
            </p>
          </div>
        )
      )}

      <div className="mt-4 flex flex-col gap-4">
        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Class details</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Faculty observed">
              <input readOnly value={you(report.observee_name, report.observee_id)} className={input} />
            </Field>
            <Field label="Course and section">
              <input readOnly value={`${report.course_code}.${report.section_name} ${report.course_name}`} className={input} />
            </Field>
            <Field label="Semester">
              <input readOnly value={`${report.semester} ${report.year}`} className={input} />
            </Field>
            <Field label="Date of observation">
              <input readOnly value={report.observation_date ? longDate(report.observation_date) : '—'} className={input} />
            </Field>
            <Field label="Observer">
              <input readOnly value={you(report.observer_name, report.observer_id)} className={input} />
            </Field>
            <Field label="Template">
              <input readOnly value={report.template_version} className={input} />
            </Field>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Observation criteria</h2>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                {report.rating_scale.map((r) => ratingLabel(report.rating_scale, r.value)).join(' · ')}
              </p>
            </div>
            <div className="w-32 text-right">
              <p className="text-[11px] font-medium text-neutral-900">
                {ratedCount} of {criteria.length} rated
              </p>
              <div className="mt-1 h-1 rounded-full bg-neutral-100">
                <div
                  className="h-1 rounded-full bg-[#1c4532] transition-[width]"
                  style={{ width: `${criteria.length ? (ratedCount / criteria.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-2">
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="mt-3 border-b border-neutral-100 pb-1.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                  {g.name}
                </h3>
                <ol className="divide-y divide-neutral-100">
                  {g.criteria.map((c) => (
                    <CriterionRow
                      key={c.criterion_id}
                      number={criteria.indexOf(c) + 1}
                      criterion={c}
                      scale={report.rating_scale}
                      rating={draft.ratings[c.criterion_id] ?? null}
                      comment={draft.comments[c.criterion_id] ?? ''}
                      locked={!editable}
                      missingRating={showErrors && editable && missingRating(c)}
                      missingComment={showErrors && editable && needsComment(c)}
                      onRate={(r) => setDraft((d) => ({ ...d, ratings: { ...d.ratings, [c.criterion_id]: r } }))}
                      onComment={(value) => setDraft((d) => ({ ...d, comments: { ...d.comments, [c.criterion_id]: value } }))}
                    />
                  ))}
                </ol>
              </div>
            ))}
            {criteria.length === 0 && <p className="mt-3 text-[11px] text-neutral-500">This template has no criteria.</p>}
          </div>
        </section>

        <section className={card}>
          <Field label="Summary">
            <textarea
              rows={4}
              readOnly={!editable}
              value={draft.summary}
              onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              placeholder={editable ? 'Overall strengths and areas for growth…' : 'No summary'}
              className={input}
            />
          </Field>
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-neutral-900">Electronic signatures</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Both signatures confirm the observation happened, whether or not the observee agrees with the ratings.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SignerCard
              role="Observer"
              name={you(report.observer_name, report.observer_id)}
              detail={report.observer_signed ? 'Signed' : 'Fills in the form, then signs'}
              status={report.observer_signed ? 'Signed' : 'Not signed'}
              active={role === 'observer' && canSign}
            />
            <SignerCard
              role="Faculty observed"
              name={you(report.observee_name, report.observee_id)}
              detail={report.observee_signed ? 'Signed' : 'Reviews the form, then signs'}
              status={report.observee_signed ? 'Signed' : 'Not signed'}
              active={role === 'observee' && canSign}
            />
          </div>

          {canSign && (
            <>
              <label className="mt-4 flex items-start gap-2 text-xs text-neutral-900">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[#1c4532]"
                />
                {role === 'observer'
                  ? 'I confirm this report reflects my observation. Checking this box is my electronic signature.'
                  : 'I confirm this observation took place. Checking this box is my electronic signature.'}
              </label>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={sign}
                  disabled={busy}
                  className="rounded-md bg-[#e0791a] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-60"
                >
                  {editable ? 'Save and sign' : 'Sign report'}
                </button>
              </div>
              {showErrors && problems.length > 0 && (
                <div id="report-problems" role="alert" className="mt-3 rounded-md bg-[#fbe8d6] px-3 py-2.5 text-[11px] text-[#8a3d12]">
                  <p className="font-medium">Before you can sign:</p>
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
  scale,
  rating,
  comment,
  locked,
  missingRating,
  missingComment,
  onRate,
  onComment,
}: {
  number: number
  criterion: ObservationCriterion
  scale: RatingOption[]
  rating: number | null
  comment: string
  locked: boolean
  missingRating: boolean
  missingComment: boolean
  onRate: (r: number) => void
  onComment: (value: string) => void
}) {
  const [notesOpen, setNotesOpen] = useState(Boolean(comment))
  const commentRequired = criterion.notes_on_low_rating && rating !== null && LOW_RATINGS.includes(rating)
  const labelId = `criterion-${criterion.criterion_id}`

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#fbe8d6] text-[10px] font-medium text-[#c4561a]">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-xs text-neutral-900">
            {criterion.name}
            {!criterion.is_required && <span className="ml-1 text-[10px] text-neutral-500">(optional)</span>}
          </p>
          {criterion.description && <p className="mt-0.5 text-[11px] text-neutral-500">{criterion.description}</p>}
          {criterion.bullets.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-neutral-500">
              {criterion.bullets.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {missingRating && <p className="mt-1 text-[11px] text-[#b3261e]">Choose a rating or N/A</p>}
        </div>
        <div role="radiogroup" aria-labelledby={labelId} className="flex gap-1">
          {scale.map((r) => {
            const selected = rating === r.value
            const label = ratingLabel(scale, r.value) ?? r.label
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                title={label}
                disabled={locked}
                onClick={() => {
                  onRate(r.value)
                  if (LOW_RATINGS.includes(r.value)) setNotesOpen(true)
                }}
                className={`h-7 rounded border text-[11px] transition-colors ${r.value === NOT_APPLICABLE ? 'w-9' : 'w-7'} ${
                  selected ? RATING_SELECTED[ratingTone(r.value)] : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                } disabled:cursor-default ${missingRating ? 'border-[#b3261e]/50' : ''}`}
              >
                {ratingShort(r.value)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pl-8">
        {notesOpen || commentRequired || (locked && comment) ? (
          <Field
            label={commentRequired ? 'Comments · required for 1–2' : 'Comments'}
            tone={commentRequired ? 'warn' : undefined}
            className="mt-2"
          >
            <textarea
              rows={2}
              readOnly={locked}
              value={comment}
              onChange={(e) => onComment(e.target.value)}
              placeholder="Effective practice and opportunities for growth…"
              className={`${input} ${commentRequired ? 'border-[#e0791a]' : ''} ${missingComment ? 'border-[#b3261e]' : ''}`}
            />
          </Field>
        ) : (
          !locked && (
            <button type="button" onClick={() => setNotesOpen(true)} className="mt-1 text-[11px] text-[#e0791a] hover:underline">
              + Add comments
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

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-[#e0791a] hover:underline">
      ← Back to {label}
    </button>
  )
}

export default ObservationReportPage
