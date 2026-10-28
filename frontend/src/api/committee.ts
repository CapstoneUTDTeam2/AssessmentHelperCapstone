import type { EvaluationRow, HireLevel, Kpi } from '../data/dashboardMock'
import { getCurrentCycle } from './cycles'
import type { EvaluationCycle } from './cycles'
import { getDueProfessors, getOverdueProfessors } from './evaluationStatus'
import type { ProfessorEvaluationStatus } from './evaluationStatus'
import { formatPercent, getExecutiveDashboard, getKpis } from './kpis'
import type { ExecutiveDashboard, Kpis } from './kpis'
import { listObservations } from './observations'
import type { ObservationSummary } from './observations'
import { getObserverAlerts, startObserverSelection, notifyObservees } from './observerSelection'
import type { ObserverAlert, ObserverSelectionResult } from './observerSelection'
import { listSignupMatches } from './signups'
import type { SignupMatchList } from './signups'

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
  signups: SignupMatchList | null
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
  status: EvaluationRow['status'],
  observation: ObservationSummary | undefined,
  today: string,
): EvaluationRow {
  const next = professor.next_due_year
    ? `${professor.next_due_semester ?? ''} ${professor.next_due_year}`.trim()
    : '—'
  const row: EvaluationRow = {
    id: professor.professor_id,
    faculty: professor.name,
    level: hireLevel(professor.current_level),
    observer: null,
    session: next,
    due: professor.next_due_year
      ? `${professor.next_due_year}-${professor.next_due_semester === 'Fall' ? '08' : '01'}-01`
      : '9999-01-01',
    status,
    group,
  }
  if (!observation) return row
  const date = observation.observation_date
  row.observer = observation.observer_name
  row.session = `${observation.course_code}.${observation.section_name}${date ? ` · ${date}` : ''}`
  if (date) row.due = date
  if (observation.status === 'Completed') row.status = 'Completed'
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
    listSignupMatches(signal).catch(() => null),
    listObservations(undefined, signal).catch(() => null),
    getKpis(undefined, signal).catch(() => null),
    getExecutiveDashboard(undefined, signal).catch(() => null),
  ])

  const today = cycle?.today ?? new Date().toISOString().slice(0, 10)
  const observationByObservee = new Map((observations?.observations ?? []).map((o) => [o.observee_id, o]))
  const unmatchedIds = new Set((alerts?.alerts ?? []).filter((a) => a.level === 'none').map((a) => a.professor_id))
  const row = (p: ProfessorEvaluationStatus, group: EvaluationRow['group'], status: EvaluationRow['status']) =>
    toRow(p, group, unmatchedIds.has(p.professor_id) ? 'Unmatched' : status, observationByObservee.get(p.professor_id), today)
  const rows: EvaluationRow[] = [
    ...overdue.professors.map((p) => row(p, 'outstanding', 'Overdue')),
    ...due.professors
      .filter((p) => !overdue.professors.some((o) => o.professor_id === p.professor_id))
      .map((p) => row(p, 'upcoming', 'Pending')),
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
  return [
    {
      label: 'Eligibility Accuracy',
      detail: `KPI 1.1 · ${accuracy.correct_matches} of ${accuracy.total_matches} matches correct`,
      value: formatPercent(accuracy.percent),
      accent: accuracy.incorrect.length > 0 ? 'red' : 'green',
      detailPositive: accuracy.total_matches > 0 && accuracy.incorrect.length === 0,
    },
    {
      label: 'Overdue Evaluations',
      detail: 'KPI 1.2 · overdue this cycle',
      value: String(k.overdue_evaluation_count.count),
      accent: k.overdue_evaluation_count.count > 0 ? 'red' : 'green',
    },
    {
      label: 'Participation Rate',
      detail: `KPI 2.1 · ${participation.signed_up} signed up / ${participation.due} due`,
      value: formatPercent(participation.percent),
      accent: 'black',
      detailPositive: (participation.percent ?? 0) >= 75,
    },
    {
      label: 'Observer Utilization',
      detail: `KPI 2.2 · ${utilization.observers} observers / ${utilization.signed_up} signed up`,
      value: formatPercent(utilization.percent),
      accent: 'orange',
    },
    {
      label: 'List Sufficiency',
      detail: `KPI 3.1 · ${sufficiency.saved_matches} matches / ${sufficiency.signups} sign-ups`,
      value: sufficiency.average_list_size === null ? '—' : sufficiency.average_list_size.toFixed(1),
      accent: 'green',
    },
    {
      label: 'Missing Observations',
      detail: 'KPI 4.1 · approved but did not happen',
      value: String(missing.count),
      accent: missing.count > 0 ? 'red' : 'green',
    },
    {
      label: 'Survey Completion',
      detail: `KPI 4.2 · ${survey.completed_full_process} full process / ${survey.signups} sign-ups`,
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
      detail: 'KPI 1.2 · from evaluation-status',
      value: String(overdue),
      accent: overdue > 0 ? 'red' : 'green',
    },
    {
      label: 'Participation Rate',
      detail: signedUp === undefined ? 'KPI 2.1 · unavailable' : `KPI 2.1 · ${signedUp} signed up / ${due} due`,
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
