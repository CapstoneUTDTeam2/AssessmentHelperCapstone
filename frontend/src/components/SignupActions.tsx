import { useState } from 'react'
import { AC_SETTINGS } from '../data/settingsMock'
import { CURRENT_COURSES, TEACHER_TODAY } from '../data/teacherMock'
import { useSignups } from '../hooks/useSignups'
import { formatTime, fromIso } from '../utils/calendar'
import ObserveSignupDialog from './ObserveSignupDialog'
import ObservedSignupDialog from './ObservedSignupDialog'

// Observations can be scheduled from today through the cycle's observation deadline.
const WINDOW_START = TEACHER_TODAY
const WINDOW_END = AC_SETTINGS.observationDeadline
const CYCLE = AC_SETTINGS.currentCycle

const primary =
  'rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]'
const secondary =
  'rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50'

/** "Sign Up to Be Observed" and "Sign Up to Observe" buttons, with their pop-ups. */
export function SignupActions() {
  const { observing, observed, setObserving, setObserved } = useSignups()
  const [open, setOpen] = useState<'observe' | 'observed' | null>(null)
  const close = () => setOpen(null)

  return (
    <>
      <button type="button" onClick={() => setOpen('observe')} className={secondary}>
        {observing ? 'Edit Observing Availability' : 'Sign Up to Observe'}
      </button>
      <button type="button" onClick={() => setOpen('observed')} className={primary}>
        {observed ? 'Edit Observation Sign-up' : 'Sign Up to Be Observed'}
      </button>

      {open === 'observe' && (
        <ObserveSignupDialog
          windowStart={WINDOW_START}
          windowEnd={WINDOW_END}
          cycleLabel={CYCLE}
          teaching={CURRENT_COURSES.map((c) => ({ label: c.course, days: c.days, start: c.start, end: c.end }))}
          initial={observing}
          onClose={close}
          onSubmit={(a) => {
            setObserving(a)
            close()
          }}
        />
      )}
      {open === 'observed' && (
        <ObservedSignupDialog
          sections={CURRENT_COURSES}
          windowStart={WINDOW_START}
          windowEnd={WINDOW_END}
          cycleLabel={CYCLE}
          initial={observed}
          onClose={close}
          onSubmit={(s) => {
            setObserved(s)
            close()
          }}
        />
      )}
    </>
  )
}

/** One line per sign-up, shown under the page title. */
export function SignupStatus() {
  const { observing, observed } = useSignups()
  if (!observing && !observed) return null

  const observedSection = observed && CURRENT_COURSES.find((c) => c.course === observed.course && c.section === observed.section)
  const lines: string[] = []
  if (observed) {
    const day = (iso: string) =>
      fromIso(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const [first, ...rest] = observed.dates
    const when = rest.length === 0 ? day(first) : `${day(first)} + ${rest.length} more day${rest.length === 1 ? '' : 's'}`
    const time = observedSection ? ` · ${formatTime(observedSection.start)}` : ''
    lines.push(`Signed up to be observed · ${observed.course}.${observed.section} on ${when}${time}`)
  }
  if (observing) {
    const off = observing.unavailable.length
    lines.push(
      `Signed up to observe${off > 0 ? ` · ${off} unavailable day${off === 1 ? '' : 's'}` : ''}${observing.times ? ' · custom hours' : ''}`,
    )
  }

  return (
    <div className="mt-1 space-y-0.5">
      {lines.map((line) => (
        <p key={line} className="flex items-center gap-1 text-[11px] text-[#3f8a55]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3f8a55]" aria-hidden="true" />
          {line}
        </p>
      ))}
    </div>
  )
}
