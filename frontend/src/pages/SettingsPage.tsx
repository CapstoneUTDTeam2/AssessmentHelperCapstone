import { useState } from 'react'
import { ActionButton, ChannelToggles, ChipList, DateField, Notice, Row, Segmented, Select, SettingsLayout, Toggle } from '../components/settings'
import type { SettingsSection } from '../components/settings'
import useDraft from '../hooks/useDraft'
import { CRITERIA } from '../data/criteriaMock'
import { FACULTY } from '../data/facultyMock'
import {
  AC_SETTINGS,
  CYCLE_FREQUENCIES,
  DEADLINE_NOTICES,
  DIGEST_TIMES,
  EVALUATION_CYCLES,
  FACULTY_FIELDS,
  FACULTY_FILTERS,
  FACULTY_SORTS,
  INSTRUCTOR_LEVELS,
  LAST_COURSEBOOK_PULL,
  LEVEL_ASSIGNMENTS,
  LEVEL_RULES,
  RANK_COUNTS,
  ROWS_PER_PAGE,
  UNMATCHED_AFTER,
  UPCOMING_WINDOWS,
} from '../data/settingsMock'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const days = (n: number) => plural(n, 'day')

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(iso: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86_400_000)
}

function deadlineStatus(iso: string) {
  if (!iso) return 'Not set'
  const left = daysUntil(iso)
  if (left < 0) return `Passed ${formatDate(iso)}`
  if (left === 0) return 'Today'
  return `${days(left)} left`
}

interface FacultyUpdate {
  faculty: string
  field: string
  value: string
  at: string
}

function SettingsPage() {
  const { draft: s, set, dirty, save, discard } = useDraft(AC_SETTINGS)
  const [lastPull, setLastPull] = useState(LAST_COURSEBOOK_PULL)
  const [pulling, setPulling] = useState(false)
  const [editingFaculty, setEditingFaculty] = useState(false)
  const [facultyUpdate, setFacultyUpdate] = useState({ faculty: FACULTY[0].name, field: FACULTY_FIELDS[0] as string, value: '' })
  const [facultyLog, setFacultyLog] = useState<FacultyUpdate[]>([])

  const activeCriteria = CRITERIA.filter((c) => c.active)
  const deadlinesInOrder = !s.signupDeadline || !s.observationDeadline || s.signupDeadline < s.observationDeadline

  const pullCourseBook = () => {
    setPulling(true)
    // Placeholder until the Nebula Labs pull endpoint exists.
    setTimeout(() => {
      setLastPull(new Date().toISOString().slice(0, 10))
      setPulling(false)
    }, 800)
  }

  const saveFacultyUpdate = () => {
    if (!facultyUpdate.value.trim()) return
    setFacultyLog((log) => [
      { ...facultyUpdate, value: facultyUpdate.value.trim(), at: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) },
      ...log,
    ])
    setFacultyUpdate((u) => ({ ...u, value: '' }))
    setEditingFaculty(false)
  }

  const cycleRow = (label: string, detail: string, key: 'assistantCycle' | 'associateCycle' | 'fullCycle' | 'lecturerCycle') => (
    <Row key={key} label={label} description={detail}>
      <Select label={label} options={CYCLE_FREQUENCIES} value={s[key]} onChange={(v) => set(key, v)} />
    </Row>
  )

  const sections: SettingsSection[] = [
    {
      id: 'policy',
      title: 'Evaluation Policy',
      description: 'Who is due, how often, and the course-level rule for who may observe whom',
      content: [
        <Row
          key="criteria"
          stacked
          label="Evaluation criteria"
          description={`${activeCriteria.length} active criteria rated in every classroom observation · add, hide, or reword them on the Evaluation Criteria page`}
        >
          <ol className="grid w-full gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {activeCriteria.map((c, i) => (
              <li key={c.id} className="flex gap-2 text-[11px] text-neutral-700">
                <span className="flex h-4 w-5 shrink-0 items-center justify-center rounded bg-neutral-100 text-[10px] text-neutral-500">
                  {i + 1}
                </span>
                {c.text}
              </li>
            ))}
          </ol>
        </Row>,
        cycleRow('Assistant Professor cycle', `${RANK_COUNTS.assistant} faculty · evaluated in Fall and Spring`, 'assistantCycle'),
        cycleRow('Associate Professor cycle', `${RANK_COUNTS.associate} faculty`, 'associateCycle'),
        cycleRow('Full Professor cycle', `${RANK_COUNTS.full} faculty`, 'fullCycle'),
        cycleRow('Lecturer cycle', `${RANK_COUNTS.lecturer} faculty · non-tenure`, 'lecturerCycle'),
        <Row
          key="signups"
          label="Minimum number of observation sign-ups"
          description="Sign-ups each due faculty member needs per cycle · one observation per course/section"
        >
          <Segmented label="Minimum observation sign-ups" options={[1, 2, 3]} value={s.minSignups} onChange={(v) => set('minSignups', v)} />
        </Row>,
        <Row key="first" label="Skip first-semester faculty" description="Faculty in their first semester are not due · no evaluations are scheduled in summer">
          <Toggle label="Skip first-semester faculty" checked={s.skipFirstSemester} onChange={(v) => set('skipFirstSemester', v)} />
        </Row>,
        <Row
          key="level"
          label="Observer level rule"
          description="Course level is the first digit of the course number · observers must teach at this level in the same department"
        >
          <Segmented label="Observer level rule" options={LEVEL_RULES} value={s.levelRule} onChange={(v) => set('levelRule', v)} />
        </Row>,
        s.levelRule === 'Strictly higher' && (
          <Row key="peers" label="6000s instructors observe each other" description="No higher level exists, so 6000s peers may observe one another">
            <Toggle label="6000s instructors observe each other" checked={s.topLevelPeers} onChange={(v) => set('topLevelPeers', v)} />
          </Row>
        ),
        <Row key="basis" label="Eligibility date basis" description="Use hire date or program start date to decide when faculty are first due">
          <Segmented label="Eligibility date basis" options={['Hire date', 'Program start'] as const} value={s.eligibilityBasis} onChange={(v) => set('eligibilityBasis', v)} />
        </Row>,
        <Row key="levels" stacked label="Instructor levels in scope" description="Course levels the matching engine considers">
          <ChipList
            label="Instructor levels in scope"
            addLabel="Add level"
            items={s.levelsInScope}
            suggestions={INSTRUCTOR_LEVELS}
            onChange={(v) => set('levelsInScope', [...v].sort())}
          />
        </Row>,
      ],
    },
    {
      id: 'matching',
      title: 'Observer Matching Rules',
      description: 'How observer recommendations are served to each observee, and when faculty are flagged Unmatched',
      content: [
        <Row key="min" label="Minimum number of observer recommendations served to observee" description="Lists shorter than this count as insufficient">
          <Select label="Minimum recommendations" options={[1, 2, 3, 4, 5]} value={s.minRecommendations} onChange={(v) => set('minRecommendations', Math.min(v, s.maxRecommendations))} />
        </Row>,
        <Row key="max" label="Maximum observer recommendations served" description="When more observers qualify, this many are picked at random">
          <Select
            label="Maximum recommendations"
            options={[3, 5, 7, 10]}
            value={s.maxRecommendations}
            onChange={(v) => {
              set('maxRecommendations', v)
              if (s.minRecommendations > v) set('minRecommendations', v)
            }}
          />
        </Row>,
        <Row key="assign" label="Level assignment" description="How each instructor’s level is derived from CourseBook">
          <Segmented label="Level assignment" options={LEVEL_ASSIGNMENTS} value={s.levelAssignment} onChange={(v) => set('levelAssignment', v)} />
        </Row>,
        <Row key="balance" label="Balance observer load" description="Prefer observers with fewer assignments before picking at random">
          <Toggle label="Balance observer load" checked={s.balanceLoad} onChange={(v) => set('balanceLoad', v)} />
        </Row>,
        <Row key="unmatched" label="Flag as Unmatched" description="When no eligible observer is found, how soon the faculty member shows as Unmatched on the dashboard">
          <Select label="Flag as Unmatched" options={UNMATCHED_AFTER} value={s.unmatchedAfter} onChange={(v) => set('unmatchedAfter', v)} />
        </Row>,
        <Row key="cross" label="Allow cross-department observers" description="Off = observers must be in the observee’s department">
          <Toggle label="Allow cross-department observers" checked={s.crossDepartment} onChange={(v) => set('crossDepartment', v)} />
        </Row>,
      ],
    },
    {
      id: 'deadlines',
      title: 'Cycle & Deadlines',
      description: 'The sign-up and observation deadlines sent to faculty each cycle',
      content: [
        <Row key="cycle" label="Current evaluation cycle" description="Fall and Spring only · no summer cycle">
          <Select label="Current evaluation cycle" options={EVALUATION_CYCLES} value={s.currentCycle} onChange={(v) => set('currentCycle', v)} />
        </Row>,
        <Row key="signup" label="Sign-up deadline" description={`Last day faculty can sign up to be observed · ${deadlineStatus(s.signupDeadline)}`}>
          <DateField label="Sign-up deadline" value={s.signupDeadline} onChange={(v) => set('signupDeadline', v)} />
        </Row>,
        <Row key="observation" label="Observation deadline" description={`Observations must be completed and confirmed by the observee · ${deadlineStatus(s.observationDeadline)}`}>
          <DateField label="Observation deadline" value={s.observationDeadline} onChange={(v) => set('observationDeadline', v)} />
        </Row>,
        !deadlinesInOrder && (
          <Notice key="order" tone="warn" title="Deadlines are out of order">
            The sign-up deadline should come before the observation deadline.
          </Notice>
        ),
      ],
    },
    {
      id: 'dashboard',
      title: 'Dashboard & Lists',
      description: 'Default list views on the dashboard, Faculty, and Evaluations pages',
      content: [
        <Row key="upcoming" label="Upcoming window on Evaluations page" description='Sessions shown under "Upcoming"'>
          <Segmented label="Upcoming window" options={UPCOMING_WINDOWS} value={s.upcomingWindow} format={days} onChange={(v) => set('upcomingWindow', v)} />
        </Row>,
        <Row key="filter" label="Default Faculty list filter">
          <Select label="Default Faculty list filter" options={FACULTY_FILTERS} value={s.facultyFilter} onChange={(v) => set('facultyFilter', v)} />
        </Row>,
        <Row key="sort" label="Default Faculty list sort">
          <Select label="Default Faculty list sort" options={FACULTY_SORTS} value={s.facultySort} onChange={(v) => set('facultySort', v)} />
        </Row>,
        <Row key="rows" label="Rows per page" description="Faculty and Reports lists">
          <Segmented label="Rows per page" options={ROWS_PER_PAGE} value={s.rowsPerPage} onChange={(v) => set('rowsPerPage', v)} />
        </Row>,
      ],
    },
    {
      id: 'data',
      title: 'Data Sources & Updates',
      description: 'Where course and faculty data come from, and how to correct it',
      content: [
        <Row
          key="coursebook"
          label="UTD CourseBook (Nebula Labs API)"
          description={`Courses, sections, instructors, and terms · last pulled ${formatDate(lastPull)}`}
        >
          <ActionButton onClick={pullCourseBook}>{pulling ? 'Pulling…' : 'Update CourseBook data now'}</ActionButton>
        </Row>,
        <Row
          key="corrections"
          label="Keep manual course corrections"
          description="Corrections made on the Courses page are kept when CourseBook is pulled again"
        >
          <Toggle label="Keep manual course corrections" checked={s.keepCourseCorrections} onChange={(v) => set('keepCourseCorrections', v)} />
        </Row>,
        <Row
          key="faculty"
          stacked={editingFaculty || facultyLog.length > 0}
          label="Faculty information"
          description="Hire date, rank, instructor level, and tenure status · entered and corrected manually by AC members · used for eligibility"
        >
          {!editingFaculty ? (
            <ActionButton onClick={() => setEditingFaculty(true)}>Update faculty information</ActionButton>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                saveFacultyUpdate()
              }}
            >
              <Select label="Faculty member" options={FACULTY.map((f) => f.name)} value={facultyUpdate.faculty} onChange={(v) => setFacultyUpdate((u) => ({ ...u, faculty: v }))} />
              <Select label="Field" options={FACULTY_FIELDS} value={facultyUpdate.field as (typeof FACULTY_FIELDS)[number]} onChange={(v) => setFacultyUpdate((u) => ({ ...u, field: v }))} />
              <input
                autoFocus
                aria-label="New value"
                placeholder="New value"
                value={facultyUpdate.value}
                onChange={(e) => setFacultyUpdate((u) => ({ ...u, value: e.target.value }))}
                className="w-40 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900"
              />
              <button
                type="submit"
                disabled={!facultyUpdate.value.trim()}
                className="rounded-md bg-[#1c4532] px-3 py-1.5 text-xs text-white transition-colors hover:bg-[#13251c] disabled:opacity-50"
              >
                Save update
              </button>
              <ActionButton onClick={() => setEditingFaculty(false)}>Cancel</ActionButton>
            </form>
          )}
          {facultyLog.length > 0 && (
            <ul className="w-full space-y-1">
              {facultyLog.map((u, i) => (
                <li key={i} className="text-[11px] text-neutral-500">
                  <span className="text-neutral-900">{u.faculty}</span> · {u.field} set to “{u.value}” · {u.at}
                </li>
              ))}
            </ul>
          )}
        </Row>,
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'What AC members are alerted about, and how faculty are reminded',
      content: [
        <Row key="signup" label="New observation sign-up">
          <ChannelToggles label="New observation sign-up" value={s.notifySignup} onChange={(v) => set('notifySignup', v)} />
        </Row>,
        <Row key="signed" label="Observation signed by observer and observee">
          <ChannelToggles label="Observation signed" value={s.notifyReportSigned} onChange={(v) => set('notifyReportSigned', v)} />
        </Row>,
        <Row key="pull" label="CourseBook update fails" description="Existing data is kept until the next successful update">
          <ChannelToggles label="CourseBook update fails" value={s.notifyPullFailure} onChange={(v) => set('notifyPullFailure', v)} />
        </Row>,
        <Row key="deadlines" label="Send deadlines to faculty" description="Sign-up and observation deadline emails">
          <Select label="Send deadlines to faculty" options={DEADLINE_NOTICES} value={s.deadlineNotice} onChange={(v) => set('deadlineNotice', v)} />
        </Row>,
        <Row key="digest" label="Weekly committee digest" description="Summary of sign-ups, upcoming observations, and unmatched faculty">
          <Select label="Weekly committee digest" options={DIGEST_TIMES} value={s.weeklyDigest} onChange={(v) => set('weeklyDigest', v)} />
        </Row>,
      ],
    },
  ]

  return (
    <SettingsLayout
      title="Settings"
      subtitle="Committee-wide policy, matching rules, deadlines, data sources, and notifications · every value can be changed at any time and applies to all CS faculty going forward"
      sections={sections}
      dirty={dirty}
      onSave={save}
      onDiscard={discard}
      collapsible
      initiallyOpen={['policy']}
    />
  )
}

export default SettingsPage
