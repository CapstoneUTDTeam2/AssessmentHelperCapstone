import { useMemo, useState } from 'react'
import { businessDays, formatLongDate, formatMeetingDays, formatTime, fromIso, meetsOn } from '../utils/calendar'
import Modal from './Modal'
import MonthCalendar from './MonthCalendar'

/** A section the faculty member teaches and could be observed in. */
export interface ObservableSection {
  sectionId: number
  course: string
  title: string
  section: string
  /** CourseBook day letters, e.g. "MW" or "TR". */
  days: string
  start: string
  end: string
  room?: string
}

export interface ObservedSignup {
  sectionId: number
  course: string
  section: string
  /** Days the faculty member can be observed; the observer picks one. */
  dates: string[]
}

interface ObservedSignupDialogProps {
  sections: ObservableSection[]
  /** First and last days observations can happen this cycle (ISO dates). */
  windowStart: string
  windowEnd: string
  cycleLabel: string
  initial: ObservedSignup | null
  /** True when a signup already exists; the API does not support editing it. */
  readOnly?: boolean
  onClose: () => void
  onSubmit: (signup: ObservedSignup) => void
}

const keyOf = (s: { course: string; section: string }) => `${s.course}.${s.section}`


/** Render only while open; it opens as a modal on mount. */
function ObservedSignupDialog({
  sections,
  windowStart,
  windowEnd,
  cycleLabel,
  initial,
  readOnly = false,
  onClose,
  onSubmit,
}: ObservedSignupDialogProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(initial ? keyOf(initial) : null)
  const [dates, setDates] = useState<Set<string>>(() => new Set(initial?.dates))

  const selected = sections.find((s) => keyOf(s) === selectedKey) ?? null
  const meetingDays = useMemo(
    () => (selected ? businessDays(windowStart, windowEnd).filter((iso) => meetsOn(selected.days, fromIso(iso))) : []),
    [selected, windowStart, windowEnd],
  )

  const pickSection = (key: string) => {
    if (key === selectedKey) return
    setSelectedKey(key)
    // Dates only make sense for the section they were picked for.
    setDates(new Set())
  }

  const toggleDate = (iso: string) =>
    setDates((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })

  const sortedDates = [...dates].sort()

  return (
    <Modal
      title={readOnly ? 'Observation Sign-up' : 'Sign Up to Be Observed'}
      description={
        readOnly
          ? `Your ${cycleLabel} signup. One course per cycle; signing up also puts you in the observer pool.`
          : `Choose one of your ${cycleLabel} classes, then every day it meets that you’d be okay being observed. One course per cycle. Signing up also puts you in the observer pool.`
      }
      submitLabel={readOnly ? 'Close' : initial ? 'Save sign-up' : 'Sign up'}
      canSubmit={readOnly || (selected !== null && dates.size > 0)}
      footerNote={
        selected && dates.size > 0 ? (
          <span className="text-neutral-700">
            <span className="font-medium text-neutral-900">
              {selected.course}.{selected.section}
            </span>{' '}
            · {dates.size === 1 ? formatLongDate(sortedDates[0]) : `${dates.size} days`} · {formatTime(selected.start)}–
            {formatTime(selected.end)}
          </span>
        ) : (
          <span className="text-neutral-500">{selected ? 'Pick at least one day' : 'Pick a class'}</span>
        )
      }
      onClose={onClose}
      onSubmit={() => {
        if (readOnly) {
          onClose()
          return
        }
        if (selected) {
          onSubmit({
            sectionId: selected.sectionId,
            course: selected.course,
            section: selected.section,
            dates: sortedDates,
          })
        }
      }}
    >
      <fieldset>
        <legend className="text-xs font-medium">1. Class</legend>
        <p className="text-[11px] text-neutral-500">One observation per class section</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {sections.map((s) => {
            const key = keyOf(s)
            const checked = key === selectedKey
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                  checked ? 'border-[#e0791a] bg-[#fdf1e6]' : 'border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <input
                  type="radio"
                  name="observed-section"
                  checked={checked}
                  onChange={() => pickSection(key)}
                  className="mt-0.5 accent-[#e0791a]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium">
                    {s.course}.{s.section} · {s.title}
                  </span>
                  <span className="block text-[11px] text-neutral-500">
                    {formatMeetingDays(s.days)} {formatTime(s.start)}–{formatTime(s.end)}
                    {s.room && s.room !== '—' ? ` · ${s.room}` : ''}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5" disabled={!selected}>
        <legend className="text-xs font-medium">2. Days</legend>
        <p className="text-[11px] text-neutral-500">
          {selected
            ? `Select as many as you like · ${selected.course}.${selected.section} meets ${meetingDays.length} days before the observation deadline`
            : 'Pick a class to see the days it meets'}
        </p>
        <div className={`mt-2 ${selected ? '' : 'opacity-50'}`}>
          <MonthCalendar
            from={windowStart}
            to={windowEnd}
            renderDay={(d, iso) => {
              if (!selected || iso < windowStart || iso > windowEnd || !meetsOn(selected.days, d)) return null
              const picked = dates.has(iso)
              return (
                <button
                  type="button"
                  aria-pressed={picked}
                  aria-label={formatLongDate(iso)}
                  onClick={() => toggleDate(iso)}
                  className={`block w-full rounded border py-1 transition-colors ${
                    picked
                      ? 'border-[#e0791a] bg-[#e0791a] font-semibold text-white'
                      : 'border-[#1c4532]/20 bg-[#e3efe6] font-medium text-[#1c4532] hover:bg-[#d2e6d8]'
                  }`}
                >
                  {d.getUTCDate()}
                </button>
              )
            }}
          />
        </div>
      </fieldset>
    </Modal>
  )
}

export default ObservedSignupDialog
