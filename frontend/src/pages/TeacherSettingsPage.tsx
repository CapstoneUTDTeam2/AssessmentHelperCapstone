import { useEffect, useState } from 'react'
import { getProfessorEvaluationStatus } from '../api/evaluationStatus'
import { DEMO_PROFESSOR_ID, loggedInProfessorId, loggedInUser } from '../auth/session'
import AvailabilityEditor from '../components/AvailabilityEditor'
import { Notice, Row, Segmented, Select, SettingsLayout, Toggle } from '../components/settings'
import type { SettingsSection } from '../components/settings'
import useDraft from '../hooks/useDraft'
import { HOURS, TEACHER_SETTINGS, TIME_ZONES } from '../data/settingsMock'

function ReadOnly({ children }: { children: string }) {
  return <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">{children}</span>
}

function TeacherSettingsPage() {
  const { draft: s, set, dirty, save, discard } = useDraft(TEACHER_SETTINGS)
  const session = loggedInUser()
  const [name, setName] = useState(session?.name ?? '—')
  const [rank, setRank] = useState('—')
  const professorId = loggedInProfessorId() ?? DEMO_PROFESSOR_ID

  useEffect(() => {
    const controller = new AbortController()
    getProfessorEvaluationStatus(professorId, controller.signal)
      .then((status) => {
        setName(status.name)
        setRank(status.current_level ?? '—')
      })
      .catch(() => {
        /* keep the session name */
      })
    return () => controller.abort()
  }, [professorId])

  const sections: SettingsSection[] = [
    {
      id: 'profile',
      title: 'Profile',
      description: 'Fields the Professors table stores: name, rank, and department',
      content: [
        <Notice key="notice" title="Your profile is managed by the Assessment Committee">
          Your name, rank, and start term are kept up to date by AC members. Course assignments come from CourseBook, and
          your instructor level is based on the courses you teach. Contact a committee member to correct anything here.
        </Notice>,
        <Row key="name" label="Display name" description="Professors.ProfessorName">
          <ReadOnly>{name}</ReadOnly>
        </Row>,
        <Row key="title" label="Rank" description="Professors.CurrentLevel">
          <ReadOnly>{rank}</ReadOnly>
        </Row>,
      ],
    },
    {
      id: 'availability',
      title: 'Observer availability',
      description: 'When you can observe colleagues this cycle. You’re only matched to classes inside these hours.',
      content: [<AvailabilityEditor key="availability" professorId={professorId} />],
      // Five weekday slots plus the days off.
      settingsCount: 6,
    },
    {
      id: 'schedule',
      title: 'Schedule',
      description: 'How your teaching sections are shown. These view choices stay in this browser only.',
      content: [
        <Row key="view" label="Default schedule view" description="What opens first on your schedule">
          <Segmented
            label="Default schedule view"
            options={['Day', 'Week', 'Month'] as const}
            value={s.scheduleView}
            onChange={(v) => set('scheduleView', v)}
          />
        </Row>,
        <Row key="week" label="Week starts on">
          <Segmented
            label="Week starts on"
            options={['Sun', 'Mon'] as const}
            value={s.weekStart}
            onChange={(v) => set('weekStart', v)}
          />
        </Row>,
        <Row key="hours" label="Visible hours" description="Time range shown on the weekly grid">
          <Select label="Day starts at" options={HOURS} value={s.dayStart} onChange={(v) => set('dayStart', v)} />
          <span className="text-[11px] text-neutral-500">to</span>
          <Select label="Day ends at" options={HOURS} value={s.dayEnd} onChange={(v) => set('dayEnd', v)} />
        </Row>,
        <Row key="tz" label="Time zone">
          <Select label="Time zone" options={TIME_ZONES} value={s.timeZone} onChange={(v) => set('timeZone', v)} />
        </Row>,
        <Row
          key="observing"
          label="Show sessions I am observing"
          description="Include colleagues’ classes you are observing alongside your own"
        >
          <Toggle label="Show sessions I am observing" checked={s.showObserving} onChange={(v) => set('showObserving', v)} />
        </Row>,
      ],
    },
  ]

  return (
    <SettingsLayout
      title="Settings"
      subtitle="Name and rank come from Professors. Availability saves to the server; schedule view choices are local only."
      sections={sections}
      dirty={dirty}
      onSave={save}
      onDiscard={discard}
      collapsible
      initiallyOpen={['profile', 'availability']}
    />
  )
}

export default TeacherSettingsPage
