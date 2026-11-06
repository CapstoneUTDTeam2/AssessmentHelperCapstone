import { useEffect, useState } from 'react'
import { getProfessorEvaluationStatus } from '../api/evaluationStatus'
import { DEMO_PROFESSOR_ID, loggedInProfessorId, loggedInUser } from '../auth/session'
import AvailabilityEditor from '../components/AvailabilityEditor'
import { Notice, Row, SettingsLayout } from '../components/settings'
import type { SettingsSection } from '../components/settings'

function ReadOnly({ children }: { children: string }) {
  return <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">{children}</span>
}

function TeacherSettingsPage() {
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
      description: 'Your name and rank as the Assessment Committee has them',
      content: [
        <Notice key="notice" title="Your profile is managed by the Assessment Committee">
          Your name, rank, and start term are kept up to date by AC members. Course assignments come from CourseBook, and
          your instructor level is based on the courses you teach. Contact a committee member to correct anything here.
        </Notice>,
        <Row key="name" label="Display name" description="How your name appears to colleagues">
          <ReadOnly>{name}</ReadOnly>
        </Row>,
        <Row key="title" label="Rank" description="Sets how often you are evaluated">
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
  ]

  // Availability saves itself, so there is nothing for the page's save bar to do.
  return (
    <SettingsLayout
      title="Settings"
      subtitle="Your profile comes from the Assessment Committee. Availability saves to the server."
      sections={sections}
      dirty={false}
      onSave={() => {}}
      onDiscard={() => {}}
      collapsible
      initiallyOpen={['profile', 'availability']}
    />
  )
}

export default TeacherSettingsPage
