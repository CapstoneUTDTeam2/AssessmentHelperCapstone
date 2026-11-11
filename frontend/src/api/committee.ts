import type { EvaluationRow, HireLevel, Kpi, SignupState } from '../data/dashboardMock'
import { getCurrentCycle } from './cycles'
import type { EvaluationCycle } from './cycles'
import { getDueProfessors, getOverdueProfessors } from './evaluationStatus'
import type { ProfessorEvaluationStatus } from './evaluationStatus'
import { formatPercent, getExecutiveDashboard, getKpis } from './kpis'
import type { ExecutiveDashboard, Kpis } from './kpis'
import { listObservations } from './observations'
import type { ObservationSummary } from './observations'
import { getObserverAlerts, getSelectionSignups, startObserverSelection, notifyObservees } from './observerSelection'
import type { ObserverAlert, ObserverSelectionResult, SelectionSignupList } from './observerSelection'

const HIRE_LEVELS: Record<string, HireLevel> = {
  'Assistant Professor': 'Assistant',
  'Associate Professor': 'Associate',
  'Full Professor': 'Full',
  Lecturer: 'Lecturer',
}

export function hireLevel(currentLevel: string | null): HireLevel {
  return HIRE_LEVELS[currentLevel ?? ''] ?? 'Lecturer'
}

export interface CommitteeOverview {
  cycle: EvaluationCycle | null
  due: ProfessorEvaluationStatus[]
  overdue: ProfessorEvaluationStatus[]
  alerts: ObserverAlert[]
  noMatchCount: number
  signups: SelectionSignupList | null
  rows: EvaluationRow[]
  /** Null when GET /api/kpis failed. */
  kpis: Kpis | null
  /** Null when GET /api/dashboard/executive failed. */
  executive: ExecutiveDashboard | null
  /** This cycle's observations; empty when GET /api/observations failed. */
  observations: ObservationSummary[]
}

function toRow(
  professor: ProfessorEvaluationStatus,
  group: EvaluationRow['group'],
  signup: Exclude<SignupState, 'observer'>,
  observation: ObservationSummary | undefined,
  today: string,
): EvaluationRow {
  const year = professor.next_due_year
  const semester = professor.next_due_semester
  const row: EvaluationRow = {
    id: professor.professor_id,
    faculty: professor.name,
    level: hireLevel(professor.current_level),
    dueTerm: year ? `${semester ?? ''} ${year}`.trim() : '—',
    dueKey: year ? `${year}-${semester === 'Fall' ? 2 : 1}` : '9999',
    lastEvaluation: professor.last_evaluation_date,
    signup,
    observer: null,
    observation: null,
    observationDate: null,
    status:
      signup === 'unmatched'
        ? 'Unmatched'
        : group === 'outstanding'
          ? 'Overdue'
          : signup === 'waiting'
            ? 'Needs observer'
            : 'Not signed up',
    group,
  }
  if (!observation) return row
  const date = observation.observation_date
  row.signup = 'observer'
  row.observer = observation.observer_name
  row.observation = `${observation.course_code}.${observation.section_name}`
  row.observationDate = date
  if (observation.status === 'Completed') row.status = 'Completed'
  else if (observation.not_held) row.status = 'Not held'
  else if (date && date < today) row.status = 'Report overdue'
  else row.status = 'Confirmed'
  return row
}

export async function getCommitteeOverview(signal?: AbortSignal): Promise<CommitteeOverview> {
  const [due, overdue, alerts, cycle, signups, observations, kpis, executive] = await Promise.all([
    getDueProfessors(signal),
    getOverdueProfessors(signal),
    getObserverAlerts(signal).catch(() => null),
    getCurrentCycle(signal).catch(() => null),
    getSelectionSignups(signal).catch(() => null),
    listObservations(undefined, signal).catch(() => null),
    getKpis(undefined, signal).catch(() => null),
    getExecutiveDashboard(undefined, signal).catch(() => null),
  ])

  const today = cycle?.today ?? new Date().toISOString().slice(0, 10)
  const observationByObservee = new Map((observations?.observations ?? []).map((o) => [o.observee_id, o]))
  const unmatchedIds = new Set((alerts?.alerts ?? []).filter((a) => a.level === 'none').map((a) => a.professor_id))
  const signupStatus = new Map((signups?.signups ?? []).map((s) => [s.professor_id, s.status]))
  const signupState = (id: number): Exclude<SignupState, 'observer'> =>
    unmatchedIds.has(id) || signupStatus.get(id) === 'Unmatched' ? 'unmatched' : signupStatus.has(id) ? 'waiting' : 'none'
  const row = (p: ProfessorEvaluationStatus, group: EvaluationRow['group']) =>
    toRow(p, group, signupState(p.professor_id), observationByObservee.get(p.professor_id), today)
  const rows: EvaluationRow[] = [
    ...overdue.professors.map((p) => row(p, 'outstanding')),
    ...due.professors
      .filter((p) => !overdue.professors.some((o) => o.professor_id === p.professor_id))
      .map((p) => row(p, 'upcoming')),
  ]

  return {
    cycle,
    due: due.professors,
    overdue: overdue.professors,
    alerts: alerts?.alerts ?? [],
    noMatchCount: alerts?.no_match_count ?? 0,
    signups,
    rows,
    kpis,
    executive,
    observations: observations?.observations ?? [],
  }
}

/** KPI tiles for the committee pages: GET /api/kpis, or live counts when it is unavailable. */
export function committeeKpis(data: CommitteeOverview | null): Kpi[] {
  const k = data?.kpis
  if (!k) return fallbackKpis(data)
  const accuracy = k.evaluation_eligibility_accuracy
  const participation = k.assessment_participation_rate
  const utilization = k.observer_utilization_rate
  const sufficiency = k.list_sufficiency_rate
  const missing = k.missing_observation_count
  const survey = k.survey_completion_rate
  // Only overdue evaluations are needed during the cycle; the rest are generated after the feedback deadline.
  const waiting = `Available after ${k.feedback_deadline}`
  if (!k.final) {
    return [
      {
        label: 'Overdue Evaluations',
        detail: 'Overdue this cycle',
        value: String(k.overdue_evaluation_count.count),
        accent: k.overdue_evaluation_count.count > 0 ? 'red' : 'green',
      },
      ...['Eligibility Accuracy', 'Participation Rate', 'Observer Utilization', 'List Sufficiency', 'Missing Observations', 'Survey Completion'].map(
        (label) => ({ label, detail: waiting, value: '—', accent: 'black' as const }),
      ),
    ]
  }
  return [
    {
      label: 'Eligibility Accuracy',
      detail: `${accuracy.correct_matches} of ${accuracy.total_matches} matches correct`,
      value: formatPercent(accuracy.percent),
      accent: accuracy.incorrect.length > 0 ? 'red' : 'green',
      detailPositive: accuracy.total_matches > 0 && accuracy.incorrect.length === 0,
    },
    {
      label: 'Overdue Evaluations',
      detail: 'Overdue this cycle',
      value: String(k.overdue_evaluation_count.count),
      accent: k.overdue_evaluation_count.count > 0 ? 'red' : 'green',
    },
    {
      label: 'Participation Rate',
      detail: `${participation.signed_up} signed up / ${participation.due} due`,
      value: formatPercent(participation.percent),
      accent: 'black',
      detailPositive: (participation.percent ?? 0) >= 75,
    },
    {
      label: 'Observer Utilization',
      detail: `${utilization.observers} observers / ${utilization.signed_up} signed up`,
      value: formatPercent(utilization.percent),
      accent: 'orange',
    },
    {
      label: 'List Sufficiency',
      detail: `${sufficiency.saved_matches} matches / ${sufficiency.signups} sign-ups`,
      value: sufficiency.average_list_size === null ? '—' : sufficiency.average_list_size.toFixed(1),
      accent: 'green',
    },
    {
      label: 'Missing Observations',
      detail: 'Approved but did not happen',
      value: String(missing.count),
      accent: missing.count > 0 ? 'red' : 'green',
    },
    {
      label: 'Survey Completion',
      detail: `${survey.completed_full_process} full process / ${survey.signups} sign-ups`,
      value: formatPercent(survey.percent),
      accent: 'black',
    },
  ]
}

/** Live counts from the other endpoints when GET /api/kpis is unavailable. */
function fallbackKpis(data: CommitteeOverview | null): Kpi[] {
  const due = data?.due.length ?? 0
  const overdue = data?.overdue.length ?? 0
  const signedUp = data?.signups?.signup_count
  return [
    {
      label: 'Overdue Evaluations',
      detail: 'Overdue this cycle',
      value: String(overdue),
      accent: overdue > 0 ? 'red' : 'green',
    },
    {
      label: 'Participation Rate',
      detail: signedUp === undefined ? 'Unavailable' : `${signedUp} signed up / ${due} due`,
      value: due === 0 || signedUp === undefined ? '—' : `${Math.round((signedUp / due) * 100)}%`,
      accent: 'black',
    },
    {
      label: 'Unmatched faculty',
      detail: 'No eligible observers · AC alert',
      value: String(data?.noMatchCount ?? 0),
      accent: (data?.noMatchCount ?? 0) > 0 ? 'orange' : 'green',
    },
  ]
}

export { startObserverSelection, notifyObservees }
export type { ObserverSelectionResult }
