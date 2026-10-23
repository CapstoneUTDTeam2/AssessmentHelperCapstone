import { useState } from 'react'
import { deadlineDate } from '../api/cycles'
import { ApiError } from '../api/client'
import { useSignups } from '../hooks/useSignups'
import { formatTime, fromIso } from '../utils/calendar'
import ObservedSignupDialog from './ObservedSignupDialog'

const primary =
  'rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]'

/** Observee sign-up. Signing up also puts the professor in the observer pool. */
export function SignupActions() {
  const { classes, cycle, signup, submitObserved } = useSignups()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => setOpen(false)

  const windowStart = cycle?.today ?? ''
  const windowEnd = cycle ? deadlineDate(cycle, 'observation') : ''
  const cycleLabel = cycle ? `${cycle.semester} ${cycle.year}` : 'this cycle'
  const sections = classes.map((row) => ({
    sectionId: row.section_id,
    course: row.course_code,
    title: row.course_name,
    section: row.section_name,
    days: row.meeting_days,
    start: row.start_time,
    end: row.end_time,
  }))

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary} disabled={!cycle || sections.length === 0}>
        {signup ? 'View Observation Sign-up' : 'Sign Up to Be Observed'}
      </button>
      {error && <p className="text-[10px] text-[#b3261e]">{error}</p>}

      {open && cycle && (
        <ObservedSignupDialog
          sections={sections}
          windowStart={windowStart}
          windowEnd={windowEnd}
          cycleLabel={cycleLabel}
          readOnly={Boolean(signup)}
          initial={
            signup
              ? {
                  sectionId: signup.section_id,
                  course: signup.course_code,
                  section: signup.section_name,
                  dates: signup.preferred_dates,
                }
              : null
          }
          onClose={close}
          onSubmit={async (s) => {
            try {
              setError(null)
              await submitObserved(s.sectionId, s.dates)
              close()
            } catch (err) {
              setError(err instanceof ApiError ? String(err.message) : 'Sign-up failed')
            }
          }}
        />
      )}
    </>
  )
}

/** One line for the observee sign-up, shown under the page title. */
export function SignupStatus() {
  const { signup, cycle } = useSignups()
  if (!signup) return null

  const day = (iso: string) =>
    fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const [first, ...rest] = signup.preferred_dates
  const when =
    signup.preferred_dates.length === 0
      ? 'dates pending'
      : rest.length === 0
        ? day(first)
        : `${day(first)} + ${rest.length} more day${rest.length === 1 ? '' : 's'}`
  const time = signup.signup_time ? ` · ${formatTime(signup.signup_time.slice(0, 5))}` : ''
  const cycleLabel = cycle ? `${cycle.semester} ${cycle.year}` : 'this cycle'

  return (
    <div className="mt-1 space-y-0.5">
      <p className="flex items-center gap-1 text-[11px] text-[#3f8a55]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#3f8a55]" aria-hidden="true" />
        Signed up to be observed · {signup.course_code}.{signup.section_name} on {when}
        {time} · also in the {cycleLabel} observer pool
      </p>
    </div>
  )
}
