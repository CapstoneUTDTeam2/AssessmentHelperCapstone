import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/client'
import { ingestCourseBook } from '../api/coursebook'
import { getCourses } from '../api/courses'
import type { CatalogCourse } from '../api/courses'
import type { Course, Days, Section } from '../data/courseMock'
import { formatMeetingDays, layoutOverlaps, meetingDayLetters, weekdaysFromMeetingDays } from '../utils/calendar'

/** Schedule block colors, assigned to a course's instructors in order. */
const INSTRUCTOR_PALETTE = ['#1c4532', '#0f1f17', '#e0791a', '#3f8a55', '#c4561a']

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const DAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 }
const dayIndexes = (days: Days) => weekdaysFromMeetingDays(days).map((day) => DAY_INDEX[day])

/** Pixel height of one hour in the weekly schedule. */
const HOUR_HEIGHT = 36

type CourseFilter = 'all' | 'undergrad' | 'grad'

const COURSE_FILTERS: { key: CourseFilter; label: string; match: (c: Course) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'undergrad', label: 'Undergrad', match: (c) => !isGraduate(c) },
  { key: 'grad', label: 'Grad', match: (c) => isGraduate(c) },
]

type CourseSort = 'code' | 'title' | 'sections'

const COURSE_SORTS: Record<CourseSort, { label: string; compare: (a: Course, b: Course) => number }> = {
  code: { label: 'Course code', compare: (a, b) => a.code.localeCompare(b.code) },
  title: { label: 'Title', compare: (a, b) => a.title.localeCompare(b.title) },
  sections: { label: 'Sections', compare: (a, b) => b.sections.length - a.sections.length },
}

type SectionSort = 'number' | 'instructor'

const SECTION_SORTS: Record<SectionSort, { label: string; compare: (a: Section, b: Section) => number }> = {
  number: { label: 'Section', compare: (a, b) => a.number.localeCompare(b.number) },
  instructor: { label: 'Instructor', compare: (a, b) => a.instructor.localeCompare(b.instructor) },
}

function isGraduate(course: Course) {
  return Number(course.code.split(' ')[1]) >= 5000
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

/** CourseBook sends "Tuesday,Thursday"; the sample data sends "TR". Both become "TR". */
function asDays(value: string | null): Days {
  return meetingDayLetters(value)
}

function fromCatalog(course: CatalogCourse): Course {
  return {
    code: course.course_code,
    title: course.course_name,
    creditHours: 0,
    prereqs: [],
    department: course.course_code.split(' ')[0] ?? '—',
    history: [],
    sections: course.sections.map((section) => ({
      number: section.section_name,
      instructor: section.instructors[0]?.professor_name ?? '—',
      rank: 'Lecturer',
      days: asDays(section.meeting_days),
      start: section.start_time ?? '',
      end: section.end_time ?? '',
      room: '',
      enrolled: 0,
      capacity: 0,
      status: '',
      tone: 'ok',
    })),
  }
}

function CoursePage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CourseFilter>('all')
  const [sort, setSort] = useState<CourseSort>('code')
  const [selectedCode, setSelectedCode] = useState('')
  const [catalog, setCatalog] = useState<{ term: string; courses: Course[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullMessage, setPullMessage] = useState<string | null>(null)

  const loadCourses = (signal?: AbortSignal) =>
    getCourses(signal).then((body) => {
      const courses = body.courses.map(fromCatalog)
      setCatalog({ term: `${body.semester} ${body.year}`, courses })
      setSelectedCode((current) => current || courses[0]?.code || '')
      setError(null)
    })

  useEffect(() => {
    const controller = new AbortController()
    loadCourses(controller.signal).catch((err: unknown) => {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load courses')
    })
    return () => controller.abort()
  }, [])

  const COURSES = catalog?.courses ?? []
  const TERM = catalog?.term ?? '—'
  const totalSections = COURSES.reduce((sum, c) => sum + c.sections.length, 0)
  const selected = COURSES.find((c) => c.code === selectedCode) ?? COURSES[0]

  const courses = useMemo(() => {
    const q = search.trim().toLowerCase()
    const match = COURSE_FILTERS.find((f) => f.key === filter)!.match
    return COURSES.filter(
      (c) => match(c) && (!q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
    ).sort(COURSE_SORTS[sort].compare)
  }, [search, filter, sort, COURSES])

  if (error) {
    return (
      <main className="min-w-0 flex-1 px-6 py-7">
        <h1 className="text-xl font-semibold text-neutral-900">Course Overview</h1>
        <p className="mt-2 text-sm text-[#b3261e]">{error}</p>
      </main>
    )
  }

  if (!catalog || !selected) {
    return (
      <main className="min-w-0 flex-1 px-6 py-7">
        <h1 className="text-xl font-semibold text-neutral-900">Course Overview</h1>
        <p className="mt-2 text-sm text-neutral-500">Loading courses from the API…</p>
      </main>
    )
  }

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Course Overview</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {TERM} · {COURSES.length} courses · {totalSections} sections · from UTD CourseBook into Courses, Sections, and
            TeachingAssignment
          </p>
          {pullMessage && <p className="mt-1 text-[11px] text-neutral-600">{pullMessage}</p>}
        </div>
        <button
          type="button"
          disabled={pulling}
          onClick={() => {
            setPulling(true)
            setPullMessage(null)
            ingestCourseBook()
              .then((result) => {
                setPullMessage(
                  `Imported ${result.courses} courses, ${result.sections} sections (${result.term})`,
                )
                return loadCourses()
              })
              .catch((err: unknown) => {
                setPullMessage(
                  err instanceof ApiError ? err.message : 'CourseBook pull failed; existing data was kept',
                )
              })
              .finally(() => setPulling(false))
          }}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-60"
        >
          {pulling ? 'Syncing CourseBook…' : 'Sync CourseBook'}
        </button>
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
          <SectionsCard course={selected} term={TERM} />
          <WeeklySchedule course={selected} term={TERM} />
        </div>
      </div>
    </main>
  )
}

function CourseHeader({ course }: { course: Course }) {
  const [subject, number] = course.code.split(' ')

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
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] text-neutral-500">
          <div className="flex gap-1">
            <dt>Sections:</dt>
            <dd className="font-semibold text-neutral-900">{course.sections.length}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Instructors:</dt>
            <dd className="font-semibold text-neutral-900">{instructorsOf(course).length}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function SectionsCard({ course, term }: { course: Course; term: string }) {
  const [sort, setSort] = useState<SectionSort>('number')
  const sections = [...course.sections].sort(SECTION_SORTS[sort].compare)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Current Sections &amp; Instructors</h2>
          <p className="text-[10px] text-neutral-500">{term} · who is teaching this course right now</p>
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
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <article key={section.number} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
            <h3 className="text-[10px] text-neutral-600">Section {section.number}</h3>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-6 w-6 shrink-0 rounded-full bg-[#1c4532]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-neutral-900">{section.instructor}</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-neutral-900">{formatMeetingDays(section.days)}</p>
            <p className="text-[10px] text-neutral-600">
              {formatTime(section.start)}–{formatTime(section.end)}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function WeeklySchedule({ course, term }: { course: Course; term: string }) {
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
            All {course.code} sections · {term}
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
              {layoutOverlaps(course.sections.filter((s) => s.start && s.end && dayIndexes(s.days).includes(dayIndex)))
                .map(({ item: s, lane, lanes }, i) => {
                  const top = ((toMinutes(s.start) - firstHour * 60) / 60) * HOUR_HEIGHT
                  const blockHeight = ((toMinutes(s.end) - toMinutes(s.start)) / 60) * HOUR_HEIGHT
                  // Sections at the same time share the column side by side instead of stacking.
                  return (
                    <div
                      key={`${s.number}-${i}`}
                      title={`Sec ${s.number} · ${s.instructor} · ${formatTime(s.start)}–${formatTime(s.end)}`}
                      className="absolute overflow-hidden rounded px-1 py-0.5 text-white"
                      style={{
                        top,
                        height: blockHeight,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        backgroundColor: colorOf(s.instructor),
                      }}
                    >
                      <p className="truncate text-[9px] font-semibold">Sec {s.number}</p>
                      <p className="truncate text-[8px] opacity-80">{s.instructor}</p>
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

export default CoursePage
