import { useMemo, useState } from 'react'
import { businessDays, formatTime, isWeekend, weekdaysFromMeetingDays } from '../utils/calendar'
import Modal from './Modal'
import MonthCalendar from './MonthCalendar'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
export type Weekday = (typeof WEEKDAYS)[number]

export interface TimeRange {
  start: string
  end: string
}

/** A class the observer teaches, which blocks those hours. */
export interface TeachingBlock {
  label: string
  /** CourseBook day letters: M T W R F. */
  days: string
  start: string
  end: string
}


export interface ObserveAvailability {
  /** ISO dates the observer cannot observe. Every other business day is available. */
  unavailable: string[]
  /** Hours per weekday, or null to accept the default hours. */
  times: Record<Weekday, TimeRange> | null
}

const DEFAULT_RANGE: TimeRange = { start: '08:00', end: '17:00' }

// Half-hour steps from 7:00 AM to 9:00 PM.
const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const minutes = 7 * 60 + i * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

function defaultTimes(): Record<Weekday, TimeRange> {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, { ...DEFAULT_RANGE }])) as Record<Weekday, TimeRange>
}

/** Render only while open; it opens as a modal on mount. */
interface ObserveSignupDialogProps {
  /** First and last days observations can happen this cycle (ISO dates). */
  windowStart: string
  windowEnd: string
  cycleLabel: string
  /** Classes the observer teaches; never offered as observing time. */
  teaching: TeachingBlock[]
  initial: ObserveAvailability | null
  onClose: () => void
  onSubmit: (availability: ObserveAvailability) => void
}

function ObserveSignupDialog({ windowStart, windowEnd, cycleLabel, teaching, initial, onClose, onSubmit }: ObserveSignupDialogProps) {
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set(initial?.unavailable))
  const [editTimes, setEditTimes] = useState(initial?.times != null)
  const [times, setTimes] = useState<Record<Weekday, TimeRange>>(() => initial?.times ?? defaultTimes())

  const allDays = useMemo(() => businessDays(windowStart, windowEnd), [windowStart, windowEnd])
  const availableCount = allDays.length - unavailable.size
  const badTimes = editTimes ? WEEKDAYS.filter((d) => times[d].start >= times[d].end) : []

  const toggleDay = (iso: string) =>
    setUnavailable((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })

  const setTime = (day: Weekday, key: keyof TimeRange, value: string) =>
    setTimes((prev) => ({ ...prev, [day]: { ...prev[day], [key]: value } }))

  return (
    <Modal
      title="Sign Up to Observe"
      description={`Which days can’t you observe? Every business day in the ${cycleLabel} observation window is enabled by default.`}
      submitLabel={initial ? 'Save availability' : 'Sign up'}
      canSubmit={badTimes.length === 0 && availableCount > 0}
      footerNote={availableCount === 0 && <span className="text-[#b3261e]">Leave at least one day available</span>}
      onClose={onClose}
      onSubmit={() => onSubmit({ unavailable: [...unavailable].sort(), times: editTimes ? times : null })}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs">
          <span className="font-semibold text-[#1c4532]">{availableCount}</span>
          <span className="text-neutral-500"> of {allDays.length} business days available</span>
          {unavailable.size > 0 && <span className="text-[#c4561a]"> · {unavailable.size} unavailable</span>}
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <Legend className="border-[#1c4532]/20 bg-[#e3efe6]" label="Available" />
          <Legend className="border-neutral-200 bg-neutral-100 line-through" label="Unavailable" />
          <button
            type="button"
            onClick={() => setUnavailable(new Set())}
            disabled={unavailable.size === 0}
            className="text-[#e0791a] hover:underline disabled:text-neutral-400 disabled:no-underline"
          >
            Reset to all available
          </button>
        </div>
      </div>

      <div className="mt-3">
        <MonthCalendar
          from={windowStart}
          to={windowEnd}
          renderDay={(date, iso) => {
            if (iso < windowStart || iso > windowEnd || isWeekend(date)) return null
            const off = unavailable.has(iso)
            const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
            return (
              <button
                type="button"
                aria-pressed={off}
                aria-label={`${label}: ${off ? 'unavailable' : 'available'}`}
                onClick={() => toggleDay(iso)}
                className={`block w-full rounded border py-1 transition-colors ${
                  off
                    ? 'border-neutral-200 bg-neutral-100 text-neutral-400 line-through'
                    : 'border-[#1c4532]/20 bg-[#e3efe6] font-medium text-[#1c4532] hover:bg-[#d2e6d8]'
                }`}
              >
                {date.getUTCDate()}
              </button>
            )
          }}
        />
      </div>

      <div className="mt-5 rounded-lg border border-neutral-200">
        <label className="flex cursor-pointer items-start gap-2.5 px-3.5 py-3">
          <input
            type="checkbox"
            checked={editTimes}
            onChange={(e) => setEditTimes(e.target.checked)}
            className="mt-0.5 accent-[#1c4532]"
          />
          <span>
            <span className="block text-xs font-medium">Edit available times (optional)</span>
            <span className="block text-[11px] text-neutral-500">
              Otherwise you’re available {formatTime(DEFAULT_RANGE.start)}–{formatTime(DEFAULT_RANGE.end)} on available days,
              whenever you’re not teaching
            </span>
          </span>
        </label>
        {editTimes && (
          <div className="space-y-2 border-t border-neutral-100 px-3.5 py-3">
            <p className="text-[11px] text-neutral-500">
              You’re only offered as an observer inside these hours when you’re not teaching · your classes are left out
              automatically
            </p>
            {WEEKDAYS.map((day) => {
              const bad = badTimes.includes(day)
              const classes = teaching
                .filter((c) => weekdaysFromMeetingDays(c.days).includes(day))
                .sort((a, b) => a.start.localeCompare(b.start))
              return (
                <div key={day} className="text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10 font-medium">{day}</span>
                    <TimeSelect label={`${day} start`} value={times[day].start} onChange={(v) => setTime(day, 'start', v)} />
                    <span className="text-neutral-500">to</span>
                    <TimeSelect label={`${day} end`} value={times[day].end} onChange={(v) => setTime(day, 'end', v)} />
                    {bad && <span className="text-[11px] text-[#b3261e]">End must be after start</span>}
                  </div>
                  <p className="mt-1 pl-12 text-[11px] text-neutral-500">
                    {classes.length === 0
                      ? 'No classes'
                      : `Except while teaching ${classes.map((c) => `${c.label} ${formatTime(c.start)}–${formatTime(c.end)}`).join(' · ')}`}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-neutral-500">
      <span className={`h-3 w-3 rounded border ${className}`} aria-hidden="true" />
      {label}
    </span>
  )
}

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs"
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {formatTime(t)}
        </option>
      ))}
    </select>
  )
}

export default ObserveSignupDialog
