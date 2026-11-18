import { useEffect, useState } from 'react'
import { ingestCourseBook } from '../api/coursebook'
import { deadlineDate, getCurrentCycle, updateCycleDeadlines } from '../api/cycles'
import { ApiError } from '../api/client'
import { getEvaluationPolicy, policyValues, updateEvaluationPolicy } from '../api/evaluationPolicy'
import type { EvaluationPolicyState, PolicyValues } from '../api/evaluationPolicy'
import { ActionButton, DateField, Notice, Row, Select, SettingsLayout } from '../components/settings'
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

const YEARS = [1, 2, 3, 4, 5] as const
const SIGNUPS = [1, 2, 3, 4, 5] as const
const OBSERVERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
const everyYears = (n: number) => (n === 1 ? 'Every year' : `Every ${n} years`)

function SettingsPage() {
  const [cycleId, setCycleId] = useState<number | null>(null)
  const [term, setTerm] = useState('—')
  const [saved, setSaved] = useState(EMPTY)
  const [draft, setDraft] = useState(EMPTY)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullMessage, setPullMessage] = useState<string | null>(null)

  const [policy, setPolicy] = useState<EvaluationPolicyState | null>(null)
  const [policyDraft, setPolicyDraft] = useState<PolicyValues | null>(null)

  const deadlinesDirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const policySaved = policy?.editable ? policyValues(policy.editable.policy) : null
  const policyDirty = policyDraft !== null && JSON.stringify(policyDraft) !== JSON.stringify(policySaved)
  const dirty = deadlinesDirty || policyDirty
  const setPolicyValue = (key: keyof PolicyValues, value: number) =>
    setPolicyDraft((current) => (current ? { ...current, [key]: value } : current))
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
    getEvaluationPolicy(controller.signal)
      .then((state) => {
        setPolicy(state)
        setPolicyDraft(state.editable ? policyValues(state.editable.policy) : null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(err instanceof Error ? err.message : 'Could not load the evaluation policy')
      })
    return () => controller.abort()
  }, [])

  const currentTerm = policy ? `${policy.current.semester} ${policy.current.year}` : term
  const editableTerm = policy?.editable ? `${policy.editable.semester} ${policy.editable.year}` : null
  const shown = policyDraft ?? (policy ? policyValues(policy.current.policy) : null)
  const inEffect = policy?.current.policy
  const changesNext = policy?.editable != null && policy.editable.cycle_id !== policy.current.cycle_id
  const policyControl = (key: keyof PolicyValues, options: readonly number[], label: string, format: (n: number) => string) =>
    policyDraft ? (
      <Select options={options} value={policyDraft[key]} onChange={(v) => setPolicyValue(key, v)} label={label} format={format} />
    ) : (
      <span className="rounded-md bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">{shown ? format(shown[key]) : '—'}</span>
    )

  const orderOk =
    (!draft.signup || !draft.observation || draft.signup <= draft.observation) &&
    (!draft.observation || !draft.post_observation_feedback || draft.observation <= draft.post_observation_feedback)

  const sections: SettingsSection[] = [
    {
      id: 'deadlines',
      title: 'Cycle & Deadlines',
      description: `Deadlines for the ${term} evaluation cycle.`,
      content: [
        <Row key="term" label="Current evaluation cycle" description="The Spring or Fall semester in progress">
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
          description={`App survey once both have signed the report · ${deadlineStatus(draft.app_feedback)}`}
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
      id: 'coursebook',
      title: 'CourseBook',
      description: 'Departments, terms, courses, sections and instructors come from UTD CourseBook',
      content: [
        <Notice key="notice" title="What an update changes">
          Rank and start semester aren't in CourseBook, so updating never changes them. If the update fails, the
          current data is kept.
        </Notice>,
        <Row
          key="pull"
          label="UTD CourseBook (Nebula Labs API)"
          description={
            pullMessage ??
            `CS sections for ${term === '—' ? 'the current cycle' : term} · meeting days and times only`
          }
        >
          <ActionButton
            onClick={() => {
              if (pulling) return
              setPulling(true)
              setPullMessage(null)
              ingestCourseBook()
                .then((result) => {
                  setPullMessage(
                    `Imported ${result.courses} courses, ${result.sections} sections, ${result.professors} professors (${result.term})`,
                  )
                })
                .catch((err: unknown) => {
                  setPullMessage(err instanceof ApiError ? err.message : 'CourseBook pull failed; existing data was kept')
                })
                .finally(() => setPulling(false))
            }}
          >
            {pulling ? 'Pulling…' : 'Update CourseBook data now'}
          </ActionButton>
        </Row>,
      ],
    },
    {
      id: 'policy',
      title: 'Evaluation Policy',
      description: editableTerm
        ? `Rules for the ${editableTerm} evaluation cycle. A cycle keeps its rules once it starts.`
        : 'A cycle keeps its rules once it starts.',
      content: [
        policy && (
          <Notice key="applies" title={editableTerm ? `Changes apply to ${editableTerm}` : 'Nothing to change yet'}>
            {changesNext && inEffect
              ? `${currentTerm} has started (someone signed up or the sign-up deadline passed), so it keeps its current rules: Assistant ${everyYears(inEffect.assistant_frequency_years).toLowerCase()}, Associate/Full ${everyYears(inEffect.senior_frequency_years).toLowerCase()}, ${inEffect.signups_per_cycle} sign-up(s) per observee, up to ${inEffect.max_observers} observers.`
              : editableTerm
                ? `${currentTerm} hasn't started yet, so changes apply to it right away. Once someone signs up or the sign-up deadline passes, changes go to the next cycle.`
                : `${currentTerm} has started and there is no next cycle yet, so these rules can't be changed now.`}
          </Notice>
        ),
        <Row key="assistant" label="Assistant Professor" description="How often they are evaluated, in calendar years">
          {policyControl('assistant_frequency_years', YEARS, 'Assistant Professor frequency', everyYears)}
        </Row>,
        <Row key="associate" label="Associate / Full Professor" description="How often they are evaluated, in calendar years">
          {policyControl('senior_frequency_years', YEARS, 'Associate and Full Professor frequency', everyYears)}
        </Row>,
        <Row key="signup-rule" label="Observation sign-ups" description="Courses each observee can sign up for per cycle">
          {policyControl('signups_per_cycle', SIGNUPS, 'Sign-ups per cycle', (n) => `${n} per cycle`)}
        </Row>,
        <Row
          key="match"
          label="Observer matching"
          description="Most names on each observee's list. Observers are always from the same department and teach the same course level; the pool is filled on observee signup."
        >
          {policyControl('max_observers', OBSERVERS, 'Most observers per list', (n) => `Up to ${n}`)}
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
        subtitle="Cycle deadlines, course data and the evaluation rules."
        sections={sections}
        dirty={dirty}
        onSave={() => {
          const persist = async () => {
            if (policyDirty && policyDraft) {
              try {
                const next = await updateEvaluationPolicy(policyDraft)
                setPolicy(next)
                setPolicyDraft(next.editable ? policyValues(next.editable.policy) : null)
                setSaveError(null)
              } catch (err) {
                setSaveError(err instanceof ApiError ? err.message : 'Could not save the evaluation policy')
                return
              }
            }
            if (!deadlinesDirty) return
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
        onDiscard={() => {
          setDraft(saved)
          setPolicyDraft(policySaved)
        }}
        collapsible
        initiallyOpen={['deadlines']}
      />
    </>
  )
}

export default SettingsPage
