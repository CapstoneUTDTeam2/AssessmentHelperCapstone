import { useEffect, useState } from 'react'
import { getObserveeClasses, getTeachingHistory } from '../api/classes'
import type { ObserveeClass } from '../api/classes'
import { getProfessorEvaluationStatus } from '../api/evaluationStatus'
import { DEMO_PROFESSOR_ID, loggedInProfessorId } from '../auth/session'
import SortHeader from '../components/SortHeader'
import { MockDataBadge, MockDataNote } from '../components/MockData'
import { EVALUATION_HISTORY, PROFILE_DETAILS, TEACHER_PROFILE, UPCOMING } from '../data/teacherMock'
import type { CurrentCourse, EvaluationOutcome, PastEvaluation, TeachingTerm } from '../data/teacherMock'
import { useSortedRows } from '../hooks/useSortedRows'
import type { Comparators } from '../hooks/useSortedRows'

const OUTCOME_PILLS: Record<EvaluationOutcome, string> = {
  'Exceeds expectations': 'bg-[#1c4532]',
  'Meets expectations': 'bg-[#3f8a55]',
  'Needs improvement': 'bg-[#e0791a]',
}

/** Rows in the profile card that are drawn in the accent color. */
const HIGHLIGHTED_FIELDS = new Set(['Next evaluation'])

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

function formatMonth(yearMonth: string) {
  return new Date(`${yearMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' })
}

/** Observation appointments are not on the API yet (observer-request stubs). */
function observationOf(c: CurrentCourse): { date: string } | undefined {
  return UPCOMING.find((u) => u.kind === 'Being observed' && u.course.startsWith(c.course) && u.start === c.start)
}

const COURSE_COMPARATORS: Comparators<CurrentCourse, 'course' | 'section' | 'time' | 'evaluation'> = {
  course: (a, b) => a.course.localeCompare(b.course) || a.section.localeCompare(b.section),
  section: (a, b) => a.section.localeCompare(b.section),
  time: (a, b) => a.days.localeCompare(b.days) || a.start.localeCompare(b.start),
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

function toCurrentCourse(row: ObserveeClass): CurrentCourse {
  return {
    course: row.course_code,
    title: row.course_name,
    section: row.section_name,
    days: row.meeting_days,
    start: row.start_time,
    end: row.end_time,
    room: '—',
    enrolled: 0,
    capacity: 0,
  }
}

function MyProfilePage() {
  const [courses, setCourses] = useState<CurrentCourse[]>([])
  const [history, setHistory] = useState<TeachingTerm[]>([])
  const [termLabel, setTermLabel] = useState('Fall 2026')
  const [profileName, setProfileName] = useState(TEACHER_PROFILE.name)
  const [cycle, setCycle] = useState(TEACHER_PROFILE.evaluationCycle)
  const [nextEvaluation, setNextEvaluation] = useState(TEACHER_PROFILE.nextEvaluation)
  const [hireLevel, setHireLevel] = useState(TEACHER_PROFILE.rank)
  const [lastEvaluation, setLastEvaluation] = useState(
    PROFILE_DETAILS.appointment.find(([label]) => label === 'Last evaluation')?.[1] ?? '—',
  )

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getObserveeClasses(loggedInProfessorId() ?? DEMO_PROFESSOR_ID, controller.signal),
      getTeachingHistory(loggedInProfessorId() ?? DEMO_PROFESSOR_ID, controller.signal),
      getProfessorEvaluationStatus(loggedInProfessorId() ?? DEMO_PROFESSOR_ID, controller.signal).catch(() => null),
    ])
      .then(([classes, teaching, status]) => {
        setCourses(classes.classes.map(toCurrentCourse))
        setTermLabel(`${classes.semester} ${classes.year}`)
        setProfileName(classes.professor_name)
        setHistory(
          teaching.terms.map((term) => ({
            semester: `${term.semester} ${term.year}`,
            order: `${term.year}-${term.semester === 'Spring' ? '1' : term.semester === 'Summer' ? '2' : '3'}`,
            courses: term.courses,
            sections: term.sections,
          })),
        )
        if (status) {
          setCycle(
            status.frequency_years === 1
              ? 'Every year'
              : status.frequency_years
                ? `Every ${status.frequency_years} years`
                : '—',
          )
          setNextEvaluation(
            status.next_due_year ? `${status.next_due_semester ?? ''} ${status.next_due_year}`.trim() : '—',
          )
          setHireLevel(status.current_level ?? '—')
          setLastEvaluation(status.last_evaluation_date ? formatDay(status.last_evaluation_date) : 'Never')
        }
      })
      .catch(() => {
        /* keep mock profile fields; course tables stay empty */
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">My Profile</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Your appointment, courses, and evaluation record as seen by the Evaluation Committee
          </p>
        </div>
      </header>

      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[276px_1fr]">
        <ProfileCard
          name={profileName}
          cycle={cycle}
          nextEvaluation={nextEvaluation}
          hireLevel={hireLevel}
          lastEvaluation={lastEvaluation}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <CurrentCoursesCard courses={courses} termLabel={termLabel} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <TeachingHistoryCard history={history} />
            <EvaluationHistoryCard nextEvaluation={nextEvaluation} />
          </div>
        </div>
      </div>
    </main>
  )
}

function ProfileCard({
  name,
  cycle,
  nextEvaluation,
  hireLevel,
  lastEvaluation,
}: {
  name: string
  cycle: string
  nextEvaluation: string
  hireLevel: string
  lastEvaluation: string
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3.5">
        <span className="h-14 w-14 shrink-0 rounded-full bg-[#c4561a]" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{name}</h2>
          <p className="text-[11px] text-neutral-500">{hireLevel} · Computer Science</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#1c4532] px-2.5 py-0.5 text-[10px] font-medium text-white">{hireLevel}</span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-700">Observer-eligible</span>
          </div>
        </div>
      </div>
      <DetailList
        title="Appointment & Evaluation"
        rows={PROFILE_DETAILS.appointment.map(([label, value]) =>
          label === 'Evaluation cycle'
            ? [label, cycle]
            : label === 'Next evaluation'
              ? [label, nextEvaluation]
              : label === 'Rank'
                ? [label, hireLevel]
                : label === 'Last evaluation'
                  ? [label, lastEvaluation]
                  : [label, value],
        )}
      />
    </section>
  )
}

function DetailList({ title, rows, mock }: { title: string; rows: [string, string][]; mock?: boolean }) {
  return (
    <div className="mt-4">
      <h3 className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wide text-neutral-500 uppercase">
        {title}
        {mock && <MockDataBadge />}
      </h3>
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

function CurrentCoursesCard({ courses, termLabel }: { courses: CurrentCourse[]; termLabel: string }) {
  const { sorted, sort, toggle } = useSortedRows(courses, COURSE_COMPARATORS, { key: 'course', dir: 'asc' })
  const courseCount = new Set(courses.map((c) => c.course)).size

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Current Courses · {termLabel}</h2>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            {courseCount} courses · {courses.length} sections · from TeachingAssignment
          </p>
          <MockDataNote>Evaluation dates in this table are placeholders. Sections have no room or enrollment columns.</MockDataNote>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-[10px]">
          <thead>
            <tr className="bg-neutral-100 text-neutral-600">
              <SortHeader label="Course" sortKey="course" sort={sort} onSort={toggle} first />
              <SortHeader label="Sec." sortKey="section" sort={sort} onSort={toggle} />
              <SortHeader label="Days / Time" sortKey="time" sort={sort} onSort={toggle} />
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

function TeachingHistoryCard({ history }: { history: TeachingTerm[] }) {
  const { sorted, sort, toggle } = useSortedRows(history, TERM_COMPARATORS, { key: 'semester', dir: 'desc' })
  const courses = new Set(history.flatMap((t) => t.courses)).size
  const sections = history.reduce((sum, t) => sum + t.sections, 0)

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Teaching History</h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">Last {history.length} semesters · sections taught</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <HistoryStat value={courses} label="Courses" accent />
        <HistoryStat value={sections} label="Sections" />
        <HistoryStat value={history.length} label="Semesters" />
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

function EvaluationHistoryCard({ nextEvaluation }: { nextEvaluation: string }) {
  const { sorted, sort, toggle } = useSortedRows(EVALUATION_HISTORY, EVALUATION_COMPARATORS, { key: 'date', dir: 'desc' })

  return (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        Evaluation History
        <MockDataBadge />
      </h2>
      <MockDataNote>Past observations have no API yet.</MockDataNote>

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

      <div className="mt-3 flex justify-between gap-2 rounded-md bg-neutral-50 px-2.5 py-2 text-[10px]">
        <span className="text-neutral-500">Next evaluation (from due-status API)</span>
        <span className="text-[#e0791a]">{nextEvaluation}</span>
      </div>
    </section>
  )
}

export default MyProfilePage
