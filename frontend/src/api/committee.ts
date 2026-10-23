import type { EvaluationRow, HireLevel } from '../data/dashboardMock'
import { getCurrentCycle } from './cycles'
import type { EvaluationCycle } from './cycles'
import { getDueProfessors, getOverdueProfessors } from './evaluationStatus'
import type { ProfessorEvaluationStatus } from './evaluationStatus'
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
}

function toRow(professor: ProfessorEvaluationStatus, group: EvaluationRow['group'], status: EvaluationRow['status']): EvaluationRow {
  const next = professor.next_due_year
    ? `${professor.next_due_semester ?? ''} ${professor.next_due_year}`.trim()
    : '—'
  return {
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
}

export async function getCommitteeOverview(signal?: AbortSignal): Promise<CommitteeOverview> {
  const [due, overdue, alerts, cycle, signups] = await Promise.all([
    getDueProfessors(signal),
    getOverdueProfessors(signal),
    getObserverAlerts(signal).catch(() => null),
    getCurrentCycle(signal).catch(() => null),
    listSignupMatches(signal).catch(() => null),
  ])

  const unmatchedIds = new Set((alerts?.alerts ?? []).filter((a) => a.level === 'none').map((a) => a.professor_id))
  const rows: EvaluationRow[] = [
    ...overdue.professors.map((p) => toRow(p, 'outstanding', unmatchedIds.has(p.professor_id) ? 'Unmatched' : 'Overdue')),
    ...due.professors
      .filter((p) => !overdue.professors.some((o) => o.professor_id === p.professor_id))
      .map((p) => toRow(p, 'upcoming', unmatchedIds.has(p.professor_id) ? 'Unmatched' : 'Pending')),
  ]

  return {
    cycle,
    due: due.professors,
    overdue: overdue.professors,
    alerts: alerts?.alerts ?? [],
    noMatchCount: alerts?.no_match_count ?? 0,
    signups,
    rows,
  }
}

export { startObserverSelection, notifyObservees }
export type { ObserverSelectionResult }
