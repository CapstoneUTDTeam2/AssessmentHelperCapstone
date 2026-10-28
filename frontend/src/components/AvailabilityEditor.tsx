import { useEffect, useState } from 'react'
import { getAvailability, saveAvailability } from '../api/availability'
import type { AvailabilityWeekday, ObserverAvailability } from '../api/availability'
import { ApiError } from '../api/client'
import { DateField, Notice, Row } from './settings'

const WEEKDAYS: { key: AvailabilityWeekday; label: string }[] = [
  { key: 'M', label: 'Monday' },
  { key: 'T', label: 'Tuesday' },
  { key: 'W', label: 'Wednesday' },
  { key: 'R', label: 'Thursday' },
  { key: 'F', label: 'Friday' },
]

type Slot = { on: boolean; start: string; end: string }
type Week = Record<AvailabilityWeekday, Slot>

const DEFAULT_SLOT: Slot = { on: false, start: '09:00', end: '17:00' }

function weekFrom(availability: ObserverAvailability): Week {
  const week = Object.fromEntries(WEEKDAYS.map((d) => [d.key, { ...DEFAULT_SLOT }])) as Week
  for (const slot of availability.weekly) week[slot.weekday] = { on: true, start: slot.start_time, end: slot.end_time }
  return week
}

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

const timeInput = 'rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 disabled:text-neutral-400'

/**
 * Weekly observing hours and days off for this cycle (GET/PUT /api/observers/{id}/availability).
 * Saves straight to the backend, separately from the page's local view settings.
 */
export default function AvailabilityEditor({ professorId }: { professorId: number }) {
  const [loaded, setLoaded] = useState<ObserverAvailability | null>(null)
  const [week, setWeek] = useState<Week | null>(null)
  const [dates, setDates] = useState<string[]>([])
  const [newDate, setNewDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const apply = (availability: ObserverAvailability) => {
    setLoaded(availability)
    setWeek(weekFrom(availability))
    setDates([...availability.unavailable_dates].sort())
  }

  useEffect(() => {
    const controller = new AbortController()
    getAvailability(professorId, controller.signal)
      .then(apply)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to load availability')
      })
    return () => controller.abort()
  }, [professorId])

  if (!week || !loaded) {
    return <p className="py-3 text-[11px] text-neutral-500">{error ?? 'Loading availability…'}</p>
  }

  const dirty =
    JSON.stringify(week) !== JSON.stringify(weekFrom(loaded)) ||
    JSON.stringify(dates) !== JSON.stringify([...loaded.unavailable_dates].sort())
  const setSlot = (day: AvailabilityWeekday, patch: Partial<Slot>) => setWeek({ ...week, [day]: { ...week[day], ...patch } })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      apply(
        await saveAvailability(professorId, {
          weekly: WEEKDAYS.filter((d) => week[d.key].on).map((d) => ({
            weekday: d.key,
            start_time: week[d.key].start,
            end_time: week[d.key].end,
          })),
          unavailable_dates: dates,
        }),
      )
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Saving failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {loaded.enrollment_status === null && (
        <Notice title="You’re not in the observer pool yet" tone="warn">
          Saving your availability adds you to the observer pool for {loaded.semester} {loaded.year}.
        </Notice>
      )}
      {WEEKDAYS.map((d) => {
        const slot = week[d.key]
        return (
          <Row key={d.key} label={d.label} description={slot.on ? undefined : 'Not available'}>
            <label className="flex items-center gap-1.5 text-[11px] text-neutral-700">
              <input
                type="checkbox"
                checked={slot.on}
                onChange={(e) => setSlot(d.key, { on: e.target.checked })}
                className="accent-[#1c4532]"
              />
              Available
            </label>
            <input
              type="time"
              aria-label={`${d.label} from`}
              value={slot.start}
              disabled={!slot.on}
              onChange={(e) => setSlot(d.key, { start: e.target.value })}
              className={timeInput}
            />
            <span className="text-[11px] text-neutral-500">to</span>
            <input
              type="time"
              aria-label={`${d.label} until`}
              value={slot.end}
              disabled={!slot.on}
              onChange={(e) => setSlot(d.key, { end: e.target.value })}
              className={timeInput}
            />
          </Row>
        )
      })}
      <Row label="Days you can’t observe" description="Conferences, travel, or other days off before the observation deadline" stacked>
        {dates.map((d) => (
          <span key={d} className="flex items-center gap-1 rounded-full bg-[#1c4532] py-1 pr-1.5 pl-2.5 text-[11px] text-white">
            {shortDate(d)}
            <button
              type="button"
              aria-label={`Remove ${d}`}
              onClick={() => setDates(dates.filter((x) => x !== d))}
              className="rounded-full px-1 text-white/80 hover:bg-white/15 hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <DateField label="Add a day you can't observe" value={newDate} onChange={setNewDate} />
        <button
          type="button"
          disabled={!newDate || dates.includes(newDate)}
          onClick={() => {
            setDates([...dates, newDate].sort())
            setNewDate('')
          }}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 hover:bg-neutral-50 disabled:text-neutral-400"
        >
          Add
        </button>
      </Row>
      <div className="flex items-center justify-end gap-3 py-3">
        {error && <span className="text-[11px] text-[#b3261e]">{error}</span>}
        {savedAt && !dirty && !error && <span className="text-[11px] text-neutral-500">Saved at {savedAt}</span>}
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="rounded-md bg-[#e0791a] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:opacity-50"
        >
          Save availability
        </button>
      </div>
    </div>
  )
}
