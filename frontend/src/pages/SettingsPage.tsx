import { useEffect, useState } from 'react'
import { deadlineDate, getCurrentCycle, updateCycleDeadlines } from '../api/cycles'
import { ApiError } from '../api/client'
import { DateField, Notice, Row, SettingsLayout } from '../components/settings'
import type { SettingsSection } from '../components/settings'

type Deadlines = {
  signup: string
  observation: string
  post_observation_feedback: string
  app_feedback: string
}

const EMPTY: Deadlines = {
  signup: '',
  observation: '',
  post_observation_feedback: '',
  app_feedback: '',
}

function formatDate(iso: string) {
  if (!iso) return 'Not set'
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
  return `${left} day${left === 1 ? '' : 's'} left`
}

function SettingsPage() {
  const [cycleId, setCycleId] = useState<number | null>(null)
  const [term, setTerm] = useState('—')
  const [saved, setSaved] = useState(EMPTY)
  const [draft, setDraft] = useState(EMPTY)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (key: keyof Deadlines, value: string) => setDraft((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const controller = new AbortController()
    getCurrentCycle(controller.signal)
      .then((cycle) => {
        const next = {
          signup: deadlineDate(cycle, 'signup'),
          observation: deadlineDate(cycle, 'observation'),
          post_observation_feedback: deadlineDate(cycle, 'post_observation_feedback'),
          app_feedback: deadlineDate(cycle, 'app_feedback'),
        }
        setCycleId(cycle.cycle_id)
        setTerm(`${cycle.semester} ${cycle.year}`)
        setSaved(next)
        setDraft(next)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(err instanceof Error ? err.message : 'Could not load the evaluation cycle')
      })
    return () => controller.abort()
  }, [])

  const orderOk =
    (!draft.signup || !draft.observation || draft.signup <= draft.observation) &&
    (!draft.observation || !draft.post_observation_feedback || draft.observation <= draft.post_observation_feedback)

  const sections: SettingsSection[] = [
    {
      id: 'deadlines',
      title: 'Cycle & Deadlines',
      description: `EvaluationCycle columns for ${term}. These four dates are the only settings the database stores.`,
      content: [
        <Row key="term" label="Current evaluation cycle" description="Latest Spring or Fall EvaluationCycle row">
          <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">{term}</span>
        </Row>,
        <Row
          key="signup"
          label="Sign-up deadline"
          description={`Last day faculty can sign up to be observed · ${deadlineStatus(draft.signup)}`}
        >
          <DateField label="Sign-up deadline" value={draft.signup} onChange={(v) => set('signup', v)} />
        </Row>,
        <Row
          key="observation"
          label="Observation deadline"
          description={`Observations must be completed by this date · ${deadlineStatus(draft.observation)}`}
        >
          <DateField label="Observation deadline" value={draft.observation} onChange={(v) => set('observation', v)} />
        </Row>,
        <Row
          key="post"
          label="Post-observation feedback deadline"
          description={`Survey after the observation · ${deadlineStatus(draft.post_observation_feedback)}`}
        >
          <DateField
            label="Post-observation feedback deadline"
            value={draft.post_observation_feedback}
            onChange={(v) => set('post_observation_feedback', v)}
          />
        </Row>,
        <Row
          key="app"
          label="App feedback deadline"
          description={`App survey after the observation · ${deadlineStatus(draft.app_feedback)}`}
        >
          <DateField
            label="App feedback deadline"
            value={draft.app_feedback}
            onChange={(v) => set('app_feedback', v)}
          />
        </Row>,
        !orderOk && (
          <Notice key="order" tone="warn" title="Deadlines are out of order">
            Sign-up must come before observation, and observation before post-observation feedback.
          </Notice>
        ),
      ],
    },
    {
      id: 'policy',
      title: 'Evaluation Policy',
      description: 'Encoded in the ProfessorEvaluationStatus view and matching functions. Not editable here.',
      content: [
        <Row key="assistant" label="Assistant Professor" description="Once every calendar year">
          <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">Every year</span>
        </Row>,
        <Row key="associate" label="Associate / Full Professor" description="Once every 2 calendar years">
          <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">Every 2 years</span>
        </Row>,
        <Row key="signup-rule" label="Observation sign-ups" description="One course per observee per cycle">
          <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">1 per cycle</span>
        </Row>,
        <Row
          key="match"
          label="Observer matching"
          description="Same department, same course level, up to 5 names. Observer pool is filled on observee signup."
        >
          <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">Same department · same level</span>
        </Row>,
      ],
    },
  ]

  return (
    <>
      {loadError && <p className="px-6 pt-4 text-[11px] text-[#b3261e]">{loadError}</p>}
      {saveError && <p className="px-6 pt-4 text-[11px] text-[#b3261e]">{saveError}</p>}
      <SettingsLayout
        title="Settings"
        subtitle="Only EvaluationCycle deadlines save. Policy, matching, CourseBook, and notifications have no tables."
        sections={sections}
        dirty={dirty}
        onSave={() => {
          const persist = async () => {
            if (cycleId === null) {
              setSaveError('No evaluation cycle is loaded')
              return
            }
            try {
              await updateCycleDeadlines(cycleId, {
                signup: draft.signup || undefined,
                observation: draft.observation || undefined,
                post_observation_feedback: draft.post_observation_feedback || undefined,
                app_feedback: draft.app_feedback || undefined,
              })
              setSaved(draft)
              setSaveError(null)
            } catch (err) {
              setSaveError(err instanceof ApiError ? err.message : 'Could not save deadlines')
            }
          }
          void persist()
        }}
        onDiscard={() => setDraft(saved)}
        collapsible
        initiallyOpen={['deadlines']}
      />
    </>
  )
}

export default SettingsPage
