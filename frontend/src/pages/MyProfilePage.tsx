import { useMemo, useState } from 'react'
import {
  CURRENT_COURSES,
  EVALUATION_HISTORY,
  PROFILE_DETAILS,
  TEACHER_PROFILE,
  TEACHING_HISTORY,
  UPCOMING,
} from '../data/teacherMock'
import type { CurrentCourse, EvaluationOutcome, PastEvaluation, TeachingTerm } from '../data/teacherMock'

const OUTCOME_PILLS: Record<EvaluationOutcome, string> = {
  'Exceeds expectations': 'bg-[#1c4532]',
  'Meets expectations': 'bg-[#3f8a55]',
  'Needs improvement': 'bg-[#e0791a]',
}

/** Rows in the profile card that are drawn in the accent color. */
const HIGHLIGHTED_FIELDS = new Set(['Next evaluation'])

type Sort<K extends string> = { key: K; dir: 'asc' | 'desc' }
type Comparators<T, K extends string> = Record<K, (a: T, b: T) => number>

/** Sorts rows by the active column; clicking a column again flips direction. */
function useSortedRows<T, K extends string>(rows: T[], comparators: Comparators<T, K>, initial: NoInfer<Sort<K>>) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * comparators[sort.key](a, b)),
    [rows, comparators, sort],
  )
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  return { sorted, sort, toggle }
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

function formatMonth(yearMonth: string) {
  return new Date(`${yearMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
}

/** The scheduled observation of this section, if any (same course, same start time). */
function observationOf(c: CurrentCourse) {
  return UPCOMING.find((u) => u.kind === 'Being observed' && u.course.startsWith(c.course) && u.start === c.start)
}

const COURSE_COMPARATORS: Comparators<CurrentCourse, 'course' | 'section' | 'time' | 'room' | 'enrolled' | 'evaluation'> = {
  course: (a, b) => a.course.localeCompare(b.course) || a.section.localeCompare(b.section),
  section: (a, b) => a.section.localeCompare(b.section),
  time: (a, b) => a.days.localeCompare(b.days) || a.start.localeCompare(b.start),
  room: (a, b) => a.room.localeCompare(b.room),
  enrolled: (a, b) => a.enrolled - b.enrolled,
  evaluation: (a, b) => (observationOf(a)?.date ?? '9999').localeCompare(observationOf(b)?.date ?? '9999'),
}

const TERM_COMPARATORS: Comparators<TeachingTerm, 'semester' | 'courses'> = {
  semester: (a, b) => a.order.localeCompare(b.order),
  courses: (a, b) => a.courses.join().localeCompare(b.courses.join()),
}

const EVALUATION_COMPARATORS: Comparators<PastEvaluation, 'date' | 'outcome'> = {
  date: (a, b) => a.date.localeCompare(b.date),
  outcome: (a, b) => a.outcome.localeCompare(b.outcome),
}

function MyProfilePage() {
  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">My Profile</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Your appointment, courses, and evaluation record as seen by the Evaluation Committee
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
        >
          Download Summary (PDF)
        </button>
      </header>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[276px_1fr]">
        <ProfileCard />
        <div className="flex min-w-0 flex-col gap-4">
          <CurrentCoursesCard />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <TeachingHistoryCard />
            <EvaluationHistoryCard />
          </div>
        </div>
      </div>
    </main>
  )
}

function ProfileCard() {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3.5">
        <span className="h-14 w-14 shrink-0 rounded-full bg-[#c4561a]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{TEACHER_PROFILE.name}</h2>
          <p className="text-[11px] text-neutral-500">{TEACHER_PROFILE.rank} · Computer Science</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#1c4532] px-2.5 py-0.5 text-[10px] font-medium text-white">Associate</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-700">Observer-eligible</span>
          </div>
        </div>
      </div>
      <DetailList title="Contact" rows={PROFILE_DETAILS.contact} />
      <DetailList title="Appointment & Evaluation" rows={PROFILE_DETAILS.appointment} />
    </section>
  )
}

function DetailList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="mt-4">
      <h3 className="text-[9px] font-semibold tracking-wide text-neutral-500 uppercase">{title}</h3>
      <dl className="mt-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-neutral-100 py-1.5 text-[10px]">
            <dt className="text-neutral-500">{label}</dt>
            <dd className={`text-right ${HIGHLIGHTED_FIELDS.has(label) ? 'text-[#e0791a]' : 'text-neutral-900'}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function CurrentCoursesCard() {
  const { sorted, sort, toggle } = useSortedRows(CURRENT_COURSES, COURSE_COMPARATORS, { key: 'course', dir: 'asc' })
  const courseCount = new Set(CURRENT_COURSES.map((c) => c.course)).size
  const students = CURRENT_COURSES.reduce((sum, c) => sum + c.enrolled, 0)

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Current Courses · Fall 2026</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            {courseCount} courses · {CURRENT_COURSES.length} sections · {students} students · from UTD CourseBook
          </p>
        </div>
        <a href="#" onClick={(e) => e.preventDefault()} className="shrink-0 text-[11px] text-[#e0791a] hover:underline">
          View course pages →
        </a>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[600px] text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-neutral-600">
              <SortHeader label="Course" sortKey="course" sort={sort} onSort={toggle} first />
              <SortHeader label="Sec." sortKey="section" sort={sort} onSort={toggle} />
              <SortHeader label="Days / Time" sortKey="time" sort={sort} onSort={toggle} />
              <SortHeader label="Room" sortKey="room" sort={sort} onSort={toggle} />
              <SortHeader label="Enrolled" sortKey="enrolled" sort={sort} onSort={toggle} />
              <SortHeader label="Evaluation" sortKey="evaluation" sort={sort} onSort={toggle} last />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const observation = observationOf(c)
              return (
                <tr key={`${c.course}-${c.section}`} className="border-b border-neutral-100">
                  <td className="max-w-44 px-2 py-2 text-neutral-900">
                    {c.course} · {c.title}
                  </td>
                  <td className="px-2 py-2 text-neutral-700">{c.section}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-neutral-700">
                    {c.days} {c.start}–{c.end}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-neutral-700">{c.room}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-neutral-700">
                    {c.enrolled} / {c.capacity}
                  </td>
                  <td className="px-2 py-2">
                    {observation ? (
                      <span className="rounded-full bg-[#e0791a] px-2 py-0.5 text-[9px] font-medium whitespace-nowrap text-white">
                        Observed {formatDay(observation.date)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] whitespace-nowrap text-neutral-600">
                        Not scheduled
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function TeachingHistoryCard() {
  const { sorted, sort, toggle } = useSortedRows(TEACHING_HISTORY, TERM_COMPARATORS, { key: 'semester', dir: 'desc' })
  const courses = new Set(TEACHING_HISTORY.flatMap((t) => t.courses)).size
  const sections = TEACHING_HISTORY.reduce((sum, t) => sum + t.sections, 0)

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Teaching History</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">Last {TEACHING_HISTORY.length} semesters · sections taught</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <HistoryStat value={courses} label="Courses" accent />
        <HistoryStat value={sections} label="Sections" />
        <HistoryStat value={TEACHING_HISTORY.length} label="Semesters" />
      </div>

      <table className="mt-3 w-full text-[10px]">
        <thead>
          <tr className="bg-neutral-100 text-neutral-600">
            <SortHeader label="Semester" sortKey="semester" sort={sort} onSort={toggle} first />
            <SortHeader label="Courses" sortKey="courses" sort={sort} onSort={toggle} />
            <th className="rounded-r px-2 py-1.5 text-right font-normal">Sec.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.semester} className="border-b border-neutral-100">
              <td className="px-2 py-2 whitespace-nowrap text-neutral-900">{t.semester}</td>
              <td className="px-2 py-2">
                <div className="flex flex-wrap gap-1">
                  {t.courses.map((c) => (
                    <span key={c} className="rounded border border-neutral-200 px-1.5 py-0.5 text-[9px] text-neutral-800">
                      {c}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-2 py-2">
                <span
                  className={`ml-auto flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ${
                    t.sections >= 3 ? 'bg-[#1c4532]' : 'bg-[#e0791a]'
                  }`}
                >
                  {t.sections}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function HistoryStat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className={`rounded-md px-2.5 py-2 ${accent ? 'bg-[#fdf1e6]' : 'bg-neutral-50'}`}>
      <p className={`text-base font-semibold ${accent ? 'text-[#e0791a]' : 'text-[#1c4532]'}`}>{value}</p>
      <p className="text-[9px] text-neutral-500">{label}</p>
    </div>
  )
}

function EvaluationHistoryCard() {
  const { sorted, sort, toggle } = useSortedRows(EVALUATION_HISTORY, EVALUATION_COMPARATORS, { key: 'date', dir: 'desc' })
  const next = PROFILE_DETAILS.appointment.find(([label]) => label === 'Next evaluation')?.[1]

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Evaluation History</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">Formal evaluations · every 2 years</p>

      <table className="mt-3 w-full text-[10px]">
        <thead>
          <tr className="bg-neutral-100 text-neutral-600">
            <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggle} first />
            <th className="px-2 py-1.5 text-left font-normal">Observer · Course</th>
            <SortHeader label="Outcome" sortKey="outcome" sort={sort} onSort={toggle} last />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.date} className="border-b border-neutral-100">
              <td className="px-2 py-2 whitespace-nowrap text-neutral-900">{formatMonth(e.date)}</td>
              <td className="px-2 py-2 text-[9px] text-neutral-700">
                {e.observer} · {e.course}
              </td>
              <td className="px-2 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium whitespace-nowrap text-white ${OUTCOME_PILLS[e.outcome]}`}>
                  {e.outcome}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {next && (
        <div className="mt-3 flex justify-between gap-2 rounded-md bg-neutral-50 px-2.5 py-2 text-[10px]">
          <span className="text-neutral-500">Next formal evaluation</span>
          <span className="text-[#e0791a]">{next}</span>
        </div>
      )}
    </section>
  )
}

function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  first,
  last,
}: {
  label: string
  sortKey: K
  sort: Sort<K>
  onSort: (key: K) => void
  first?: boolean
  last?: boolean
}) {
  const active = sort.key === sortKey
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`px-2 py-1.5 text-left font-normal ${first ? 'rounded-l' : ''} ${last ? 'rounded-r' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1 whitespace-nowrap ${active ? 'font-medium text-neutral-900' : ''}`}
      >
        {label}
        <span className={active ? 'text-[#e0791a]' : ''} aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default MyProfilePage
