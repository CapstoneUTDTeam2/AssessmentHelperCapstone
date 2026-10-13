import { useMemo, useState } from 'react'
import { COURSES, TERM } from '../data/courseMock'
import type { Course, Days, HistoryEntry, Section, SectionTone, Term } from '../data/courseMock'
import { LEVEL_COLORS } from '../theme'

const SECTION_BADGES: Record<SectionTone, string> = {
  ok: 'bg-[#3f8a55]',
  needsObserver: 'bg-[#b3261e]',
  overdue: 'bg-[#b3261e]',
}

const COURSE_DOTS = {
  ok: 'bg-[#3f8a55]',
  attention: 'bg-[#e0791a]',
  alert: 'bg-[#b3261e]',
}

/** Schedule block colors, assigned to a course's instructors in order. */
const INSTRUCTOR_PALETTE = ['#1c4532', '#0f1f17', '#e0791a', '#3f8a55', '#c4561a']

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const DAY_INDEXES: Record<Days, number[]> = {
  MW: [0, 2],
  TR: [1, 3],
  MWF: [0, 2, 4],
}

/** Pixel height of one hour in the weekly schedule. */
const HOUR_HEIGHT = 36

const TERM_ORDER: Record<Term, number> = { Spring: 0, Summer: 1, Fall: 2 }

type CourseFilter = 'all' | 'undergrad' | 'grad' | 'needsObserver'

const COURSE_FILTERS: { key: CourseFilter; label: string; match: (c: Course) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'undergrad', label: 'Undergrad', match: (c) => !isGraduate(c) },
  { key: 'grad', label: 'Grad', match: (c) => isGraduate(c) },
  { key: 'needsObserver', label: 'Needs observer', match: (c) => needsObserverCount(c) > 0 },
]

type CourseSort = 'code' | 'title' | 'sections'

const COURSE_SORTS: Record<CourseSort, { label: string; compare: (a: Course, b: Course) => number }> = {
  code: { label: 'Course code', compare: (a, b) => a.code.localeCompare(b.code) },
  title: { label: 'Title', compare: (a, b) => a.title.localeCompare(b.title) },
  sections: { label: 'Sections', compare: (a, b) => b.sections.length - a.sections.length },
}

type SectionSort = 'number' | 'instructor' | 'enrollment'

const SECTION_SORTS: Record<SectionSort, { label: string; compare: (a: Section, b: Section) => number }> = {
  number: { label: 'Section', compare: (a, b) => a.number.localeCompare(b.number) },
  instructor: { label: 'Instructor', compare: (a, b) => a.instructor.localeCompare(b.instructor) },
  enrollment: { label: 'Enrollment', compare: (a, b) => b.enrolled - a.enrolled },
}

function isGraduate(course: Course) {
  return Number(course.code.split(' ')[1]) >= 5000
}

function needsObserverCount(course: Course) {
  return course.sections.filter((s) => s.tone === 'needsObserver').length
}

function courseTone(course: Course): keyof typeof COURSE_DOTS {
  if (course.sections.some((s) => s.tone === 'overdue')) return 'alert'
  if (course.sections.some((s) => s.tone === 'needsObserver')) return 'attention'
  return 'ok'
}

function instructorsOf(course: Course) {
  return [...new Set(course.sections.map((s) => s.instructor))]
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function formatTime(time: string) {
  return time.replace(/^0/, '')
}

function semesterValue(entry: HistoryEntry) {
  return entry.year * 10 + TERM_ORDER[entry.term]
}

function CoursePage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CourseFilter>('all')
  const [sort, setSort] = useState<CourseSort>('code')
  const [selectedCode, setSelectedCode] = useState('CS 3345')

  const totalSections = COURSES.reduce((sum, c) => sum + c.sections.length, 0)
  const selected = COURSES.find((c) => c.code === selectedCode) ?? COURSES[0]

  const courses = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = COURSE_FILTERS.find((f) => f.key === filter)!.match
    return COURSES.filter(
      (c) => match(c) && (!q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
    ).sort(COURSE_SORTS[sort].compare)
  }, [search, filter, sort])

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Course Overview</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {TERM} · {COURSES.length} courses · {totalSections} sections · synced from UTD CourseBook 2 min ago
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Sync CourseBook
          </button>
          <button
            type="button"
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            + Add Course
          </button>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
        <section className="flex max-h-[calc(100vh-140px)] min-h-80 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-neutral-900">Courses</h2>
              <label className="flex items-center gap-1 text-[10px] text-neutral-500">
                Sort:
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CourseSort)}
                  className="bg-transparent text-neutral-800 focus:outline-none"
                >
                  {(Object.keys(COURSE_SORTS) as CourseSort[]).map((key) => (
                    <option key={key} value={key}>
                      {COURSE_SORTS[key].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-2 flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-400" aria-hidden="true" />
              <span className="sr-only">Search courses</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code or title"
                className="w-full bg-transparent text-[11px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
              />
            </label>

            <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Filter courses">
              {COURSE_FILTERS.map((f) => {
                const active = filter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                      active
                        ? 'border-[#1c4532] bg-[#1c4532] text-white'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          <ul className="flex-1 overflow-y-auto border-t border-neutral-100">
            {courses.map((course) => {
              const isSelected = course.code === selected.code
              return (
                <li key={course.code} className="border-b border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setSelectedCode(course.code)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 border-l-2 px-3 py-2.5 text-left transition-colors ${
                      isSelected ? 'border-[#e0791a] bg-neutral-50' : 'border-transparent hover:bg-neutral-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-[11px] font-semibold ${isSelected ? 'text-[#e0791a]' : 'text-neutral-900'}`}>
                        {course.code}
                      </p>
                      <p className="truncate text-[10px] text-neutral-600">{course.title}</p>
                      <p className="text-[9px] text-neutral-500">
                        {course.sections.length} sections · {instructorsOf(course).length} instructors
                      </p>
                    </div>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COURSE_DOTS[courseTone(course)]}`} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
            {courses.length === 0 && (
              <li className="px-3 py-6 text-center text-[11px] text-neutral-500">No courses match.</li>
            )}
          </ul>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <CourseHeader course={selected} />
          <SectionsCard course={selected} />
          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <WeeklySchedule course={selected} />
            <HistoryCard course={selected} />
          </div>
        </div>
      </div>
    </main>
  )
}

function CourseHeader({ course }: { course: Course }) {
  const [subject, number] = course.code.split(' ')
  const enrolled = course.sections.reduce((sum, s) => sum + s.enrolled, 0)
  const capacity = course.sections.reduce((sum, s) => sum + s.capacity, 0)
  const needsObserver = needsObserverCount(course)

  return (
    <section className="flex flex-wrap items-start gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md bg-[#1c4532] text-white">
        <span className="text-[10px]">{subject}</span>
        <span className="text-lg leading-tight font-semibold">{number}</span>
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-neutral-900">{course.title}</h2>
        <span className="mt-1 inline-block rounded border border-neutral-200 px-1.5 py-px text-[9px] text-neutral-800">
          {isGraduate(course) ? 'Graduate' : 'Undergraduate'}
        </span>
        <p className="mt-1 text-[11px] text-neutral-600">
          {course.creditHours} credit hours · Prereq: {course.prereqs.length ? course.prereqs.join(', ') : 'None'} ·{' '}
          {course.department}
        </p>
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] text-neutral-500">
          <div className="flex gap-1">
            <dt>Sections:</dt>
            <dd className="font-semibold text-neutral-900">{course.sections.length}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Instructors:</dt>
            <dd className="font-semibold text-neutral-900">{instructorsOf(course).length}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Enrolled:</dt>
            <dd className="font-semibold text-neutral-900">
              {enrolled} / {capacity}
            </dd>
          </div>
        </dl>
        <p className="mt-0.5 text-[10px] text-neutral-500">
          Needs observer:{' '}
          <span className={needsObserver ? 'font-semibold text-[#e0791a]' : 'font-semibold text-neutral-900'}>
            {needsObserver === 0 ? 'None' : `${needsObserver} section${needsObserver > 1 ? 's' : ''}`}
          </span>
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-[11px] text-neutral-900 transition-colors hover:bg-neutral-50"
        >
          Edit Course
        </button>
        <button
          type="button"
          className="rounded-md bg-[#e0791a] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-[#c96a12]"
        >
          Assign Evaluation
        </button>
      </div>
    </section>
  )
}

function SectionsCard({ course }: { course: Course }) {
  const [sort, setSort] = useState<SectionSort>('number')
  const sections = [...course.sections].sort(SECTION_SORTS[sort].compare)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Current Sections &amp; Instructors</h2>
          <p className="text-[10px] text-neutral-500">{TERM} · who is teaching this course right now</p>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <label className="flex items-center gap-1 text-neutral-500">
            Sort:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SectionSort)}
              className="bg-transparent text-neutral-800 focus:outline-none"
            >
              {(Object.keys(SECTION_SORTS) as SectionSort[]).map((key) => (
                <option key={key} value={key}>
                  {SECTION_SORTS[key].label}
                </option>
              ))}
            </select>
          </label>
          <a href="#" onClick={(e) => e.preventDefault()} className="text-[#e0791a] hover:underline">
            Manage sections →
          </a>
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <article key={section.number} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
            <h3 className="text-[10px] text-neutral-600">Section {section.number}</h3>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-6 w-6 shrink-0 rounded-full ${LEVEL_COLORS[section.rank]}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-neutral-900">{section.instructor}</p>
                <p className="text-[9px] text-neutral-500">{section.rank}</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-neutral-900">{section.days}</p>
            <p className="text-[10px] text-neutral-600">
              {formatTime(section.start)}–{formatTime(section.end)}
            </p>
            <p className="text-[10px] text-neutral-600">
              Enrolled {section.enrolled} / {section.capacity}
            </p>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-medium text-white ${SECTION_BADGES[section.tone]}`}
            >
              {section.status}
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}

function WeeklySchedule({ course }: { course: Course }) {
  const instructors = instructorsOf(course)
  const colorOf = (name: string) => INSTRUCTOR_PALETTE[instructors.indexOf(name) % INSTRUCTOR_PALETTE.length]

  const firstHour = Math.floor(Math.min(...course.sections.map((s) => toMinutes(s.start))) / 60)
  const lastHour = Math.ceil(Math.max(...course.sections.map((s) => toMinutes(s.end))) / 60)
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)
  const height = hours.length * HOUR_HEIGHT
  const gridLines = `repeating-linear-gradient(to bottom, transparent 0 ${HOUR_HEIGHT - 1}px, #f0f0f0 ${HOUR_HEIGHT - 1}px ${HOUR_HEIGHT}px)`

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Weekly Schedule</h2>
          <p className="text-[10px] text-neutral-500">
            All {course.code} sections · {TERM}
          </p>
        </div>
        <ul className="flex flex-wrap gap-3 text-[10px] text-neutral-600">
          {instructors.map((name) => (
            <li key={name} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorOf(name) }} aria-hidden="true" />
              {name.replace('Professor', 'Prof.')}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200">
        <div className="grid min-w-[420px] grid-cols-[40px_repeat(5,1fr)] text-[10px]">
          <div className="border-b border-neutral-200 bg-neutral-50" />
          {WEEKDAYS.map((day) => (
            <div key={day} className="border-b border-l border-neutral-200 bg-neutral-50 py-1.5 text-center text-neutral-600">
              {day}
            </div>
          ))}

          <div className="relative" style={{ height }}>
            {hours.map((hour, i) => (
              <span
                key={hour}
                className="absolute right-1 text-[8px] text-neutral-400"
                style={{ top: i * HOUR_HEIGHT + 2 }}
              >
                {hour > 12 ? hour - 12 : hour}
                {hour >= 12 ? 'p' : 'a'}
              </span>
            ))}
          </div>

          {WEEKDAYS.map((day, dayIndex) => (
            <div
              key={day}
              className="relative border-l border-neutral-200"
              style={{ height, backgroundImage: gridLines }}
            >
              {course.sections
                .filter((s) => DAY_INDEXES[s.days].includes(dayIndex))
                .map((s) => {
                  const top = ((toMinutes(s.start) - firstHour * 60) / 60) * HOUR_HEIGHT
                  const blockHeight = ((toMinutes(s.end) - toMinutes(s.start)) / 60) * HOUR_HEIGHT
                  return (
                    <div
                      key={s.number}
                      title={`Sec ${s.number} · ${s.instructor} · ${formatTime(s.start)}–${formatTime(s.end)} · ${s.room}`}
                      className="absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-white"
                      style={{ top, height: blockHeight, backgroundColor: colorOf(s.instructor) }}
                    >
                      <p className="truncate text-[9px] font-semibold">Sec {s.number}</p>
                      <p className="truncate text-[8px] opacity-80">{s.room}</p>
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HistoryCard({ course }: { course: Course }) {
  const [sort, setSort] = useState<{ key: 'semester' | 'instructor'; dir: 'asc' | 'desc' }>({
    key: 'semester',
    dir: 'desc',
  })

  const rows = [...course.history].sort((a, b) => {
    const cmp =
      sort.key === 'semester' ? semesterValue(a) - semesterValue(b) : a.instructor.localeCompare(b.instructor)
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (key: 'semester' | 'instructor') =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const semesterCount = new Set(course.history.map((h) => `${h.term} ${h.year}`)).size

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Historical Instructors</h2>
      <p className="text-[10px] text-neutral-500">From UTD CourseBook · last {semesterCount} semesters</p>

      <table className="mt-3 w-full text-[10px]">
        <thead>
          <tr className="bg-neutral-100 text-neutral-600">
            {(['semester', 'instructor'] as const).map((key) => {
              const active = sort.key === key
              return (
                <th
                  key={key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className="px-1 py-1 text-left font-normal first:rounded-l"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(key)}
                    className={`flex w-full items-center gap-1 rounded bg-white px-1.5 py-0.5 capitalize ${
                      active ? 'font-medium text-neutral-900' : ''
                    }`}
                  >
                    {key}
                    <span className={active ? 'text-[#e0791a]' : ''} aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              )
            })}
            <th className="rounded-r px-2 py-1 text-right font-normal">Sections</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.term}-${row.year}-${row.instructor}`} className="border-b border-neutral-100">
              <td className="px-2 py-1.5 text-neutral-600">
                {row.term} {row.year}
              </td>
              <td className="px-2 py-1.5 font-medium text-neutral-900">{row.instructor}</td>
              <td className="px-2 py-1.5 text-right text-neutral-900">{row.sections}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default CoursePage
