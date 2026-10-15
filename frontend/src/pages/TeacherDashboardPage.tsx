import { useMemo, useState } from 'react'
import { SignupActions, SignupStatus } from '../components/SignupActions'
import {
  TEACHER_PROFILE,
  TEACHER_TODAY,
  UPCOMING,
  WEEKLY_SCHEDULE,
} from '../data/teacherMock'
import type { UpcomingEvaluation, UpcomingKind, Weekday } from '../data/teacherMock'

const KIND_BADGES: Record<UpcomingKind, string> = {
  'Being observed': 'bg-[#e0791a]',
  Observing: 'bg-[#1c4532]',
}

const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const FIRST_HOUR = 8
const LAST_HOUR = 17
const HOUR_HEIGHT = 26

type SortKey = 'date' | 'type'

// Dates are handled as UTC midnight so ISO strings never shift across time zones.
function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}

function addDays(iso: string, days: number) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mondayOf(iso: string) {
  const day = toDate(iso).getUTCDay()
  return addDays(iso, day === 0 ? -6 : 1 - day)
}

function format(iso: string, options: Intl.DateTimeFormatOptions) {
  return toDate(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...options })
}

function weekLabel(monday: string) {
  const friday = addDays(monday, 4)
  const sameMonth = format(monday, { month: 'short' }) === format(friday, { month: 'short' })
  return `${format(monday, { month: 'short', day: 'numeric' })}–${format(friday, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`
}

function minutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function hourLabel(hour: number) {
  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`
}

interface CalendarEvent {
  key: string
  title: string
  subtitle: string | null
  start: string
  end: string
  tone: 'class' | 'observed' | 'observing' | 'office'
}

const EVENT_STYLES: Record<CalendarEvent['tone'], string> = {
  class: 'bg-[#1c4532] text-white',
  observed: 'bg-[#e0791a] text-white',
  observing: 'bg-[#c4561a] text-white',
  office: 'border border-neutral-500 bg-white text-neutral-900',
}

function eventsOn(date: string, weekday: Weekday): CalendarEvent[] {
  const observations = UPCOMING.filter((u) => u.date === date)
  const classes = WEEKLY_SCHEDULE.filter((b) => b.days.includes(weekday)).map((block, i): CalendarEvent => {
    if (!block.course) {
      return { key: `office-${i}`, title: 'Office hours', subtitle: null, start: block.start, end: block.end, tone: 'office' }
    }
    const observed = observations.find(
      (u) => u.kind === 'Being observed' && u.course === block.courseName && u.start === block.start,
    )
    return observed
      ? { key: `class-${i}`, title: `${block.course} · Observed`, subtitle: `${observed.otherProfessor} attending`, start: block.start, end: block.end, tone: 'observed' }
      : { key: `class-${i}`, title: block.course, subtitle: block.room, start: block.start, end: block.end, tone: 'class' }
  })
  const observing = observations
    .filter((u) => u.kind === 'Observing')
    .map((u): CalendarEvent => ({
      key: `observing-${u.id}`,
      title: `Observing · ${u.course.split(' ').slice(0, 2).join(' ')}`,
      subtitle: u.otherProfessor,
      start: u.start,
      end: u.end,
      tone: 'observing',
    }))
  return [...classes, ...observing]
}

function TeacherDashboardPage() {
  const thisMonth = TEACHER_TODAY.slice(0, 7)
  const evaluationsThisMonth = UPCOMING.filter((u) => u.date.startsWith(thisMonth)).length

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Welcome back, {TEACHER_PROFILE.name}</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Fall 2026 · Week of {weekLabel(mondayOf(TEACHER_TODAY))} · {evaluationsThisMonth} evaluations this month
          </p>
          <SignupStatus />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Edit Profile
          </button>
          <SignupActions />
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ProfileCard />
        <UpcomingCard />
      </div>

      <ScheduleCard />
    </main>
  )
}

function ProfileCard() {
  const p = TEACHER_PROFILE
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-4 border-b border-neutral-100 pb-4">
        <span className="h-14 w-14 shrink-0 rounded-full bg-[#c4561a]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-900">{p.name}</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">{p.department}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#1c4532] px-2.5 py-0.5 text-[10px] font-medium text-white">{p.rank}</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-700">{p.track}</span>
          </div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <ProfileStat label="Evaluation cycle" value={p.evaluationCycle} />
        <ProfileStat label="Next evaluation" value={p.nextEvaluation} />
        <ProfileStat label="Evaluations given" value={p.evaluationsGiven} />
      </dl>
      <div className="mt-3">
        <p className="text-[10px] text-neutral-500">Instructor level</p>
        <div className="mt-1 flex gap-1.5">
          {p.instructorLevels.map((level) => (
            <span key={level} className="rounded border border-[#e0791a] px-2 py-0.5 text-[10px] text-[#e0791a]">
              {level}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-xs font-semibold text-neutral-900">{value}</dd>
    </div>
  )
}

function UpcomingCard() {
  const [sort, setSort] = useState<SortKey>('date')

  const items = useMemo(
    () =>
      UPCOMING.filter((u) => u.date >= TEACHER_TODAY).sort(
        (a, b) =>
          (sort === 'type' ? a.kind.localeCompare(b.kind) : 0) ||
          a.date.localeCompare(b.date) ||
          a.start.localeCompare(b.start),
      ),
    [sort],
  )

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Upcoming Evaluations</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">Dates you are observed and dates you observe others</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px]">
          <label className="flex items-center gap-1 text-neutral-500">
            Sort:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-transparent text-neutral-900 focus:outline-none"
            >
              <option value="date">Date</option>
              <option value="type">Type</option>
            </select>
          </label>
          <a href="#" onClick={(e) => e.preventDefault()} className="text-[#e0791a] hover:underline">
            View all →
          </a>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <UpcomingItem key={item.id} item={item} />
        ))}
        {items.length === 0 && <li className="py-6 text-center text-[11px] text-neutral-500">Nothing scheduled.</li>}
      </ul>
    </section>
  )
}

function UpcomingItem({ item }: { item: UpcomingEvaluation }) {
  const title = item.kind === 'Being observed' ? `Observed by ${item.otherProfessor}` : `Observing ${item.otherProfessor}`
  const details = [item.course, `${item.start}–${item.end}`, item.room].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-3 rounded-md bg-neutral-50 px-3 py-2">
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-neutral-200 bg-white">
        <span className="text-[8px] font-semibold text-[#e0791a] uppercase">{format(item.date, { month: 'short' })}</span>
        <span className="text-sm leading-none font-semibold text-neutral-900">{format(item.date, { day: 'numeric' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-neutral-900">{title}</p>
        <p className="truncate text-[10px] text-neutral-500">{details}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium text-white ${KIND_BADGES[item.kind]}`}>
          {item.kind}
        </span>
        <span className={`text-[9px] ${item.reportDue ? 'text-[#b3261e]' : 'text-neutral-500'}`}>
          {item.reportDue
            ? `Report due ${format(item.reportDue, { month: 'short', day: 'numeric' })}`
            : item.confirmed
              ? 'Confirmed'
              : 'Awaiting confirmation'}
        </span>
      </div>
    </li>
  )
}

function ScheduleCard() {
  const [monday, setMonday] = useState(() => mondayOf(TEACHER_TODAY))
  const sections = WEEKLY_SCHEDULE.filter((b) => b.course).length
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i)
  const gridHeight = hours.length * HOUR_HEIGHT

  return (
    <section className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Teaching Schedule</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            Week of {weekLabel(monday)}, {format(monday, { year: 'numeric' })} · {sections} sections
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ul className="flex gap-3 text-[10px] text-neutral-600">
            <LegendItem color="bg-[#1c4532]" label="Class" />
            <LegendItem color="bg-[#e0791a]" label="Being observed" />
            <LegendItem color="bg-[#c4561a]" label="Observing" />
          </ul>
          <div className="flex items-center rounded-md border border-neutral-200 text-[11px]">
            <button type="button" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))} className="px-2 py-1 hover:bg-neutral-50">
              ‹
            </button>
            <button
              type="button"
              onClick={() => setMonday(mondayOf(TEACHER_TODAY))}
              className="border-x border-neutral-200 px-3 py-1 font-medium text-neutral-900 hover:bg-neutral-50"
            >
              Today
            </button>
            <button type="button" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))} className="px-2 py-1 hover:bg-neutral-50">
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200">
        <div className="grid min-w-[640px] grid-cols-[44px_repeat(5,1fr)]">
          <div className="border-b border-neutral-200 bg-neutral-50" />
          {WEEKDAYS.map((day, i) => {
            const date = addDays(monday, i)
            const isToday = date === TEACHER_TODAY
            return (
              <div key={day} className="flex items-center justify-center gap-1.5 border-b border-l border-neutral-200 bg-neutral-50 py-1.5 text-[10px] text-neutral-600">
                {day}
                <span
                  className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-semibold ${
                    isToday ? 'bg-[#e0791a] text-white' : 'text-neutral-900'
                  }`}
                >
                  {format(date, { day: 'numeric' })}
                </span>
              </div>
            )
          })}

          <div className="relative bg-neutral-50" style={{ height: gridHeight }}>
            {hours.map((h, i) => (
              <span key={h} className="absolute right-1.5 text-[8px] text-neutral-500" style={{ top: i * HOUR_HEIGHT + 4 }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {WEEKDAYS.map((day, i) => (
            <DayColumn key={day} date={addDays(monday, i)} weekday={day} hours={hours.length} />
          ))}
        </div>
      </div>
    </section>
  )
}

function DayColumn({ date, weekday, hours }: { date: string; weekday: Weekday; hours: number }) {
  const events = eventsOn(date, weekday)
  return (
    <div className="relative border-l border-neutral-200" style={{ height: hours * HOUR_HEIGHT }}>
      {Array.from({ length: hours }, (_, i) => (
        <div key={i} className="border-b border-neutral-100" style={{ height: HOUR_HEIGHT }} />
      ))}
      {events.map((event) => {
        const top = ((minutes(event.start) - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT
        const height = ((minutes(event.end) - minutes(event.start)) / 60) * HOUR_HEIGHT - 3
        return (
          <div
            key={event.key}
            title={`${event.title} · ${event.start}–${event.end}${event.subtitle ? ` · ${event.subtitle}` : ''}`}
            className={`absolute inset-x-1 overflow-hidden rounded px-1.5 py-1 ${EVENT_STYLES[event.tone]}`}
            style={{ top: top + 1, height }}
          >
            <p className="truncate text-[9px] leading-tight font-semibold">{event.title}</p>
            {event.subtitle && <p className="truncate text-[8px] leading-tight opacity-75">{event.subtitle}</p>}
          </div>
        )
      })}
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </li>
  )
}

export default TeacherDashboardPage
