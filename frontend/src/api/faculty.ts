// Builds Faculty page rows from the evaluation-status API. The backend only
// knows name, level and evaluation timing so far; courses, email, observation
// progress and observer matches stay empty until their endpoints exist.

import type { FacultyLevel, FacultyMember, StatusTone } from '../data/facultyMock'
import { getEvaluationStatuses } from './evaluationStatus'
import type { CurrentTerm, EvaluationStatus, ProfessorEvaluationStatus } from './evaluationStatus'

const LEVELS: Record<string, FacultyLevel> = {
  'Assistant Professor': 'Assistant Prof.',
  'Associate Professor': 'Associate Prof.',
  'Full Professor': 'Full Prof.',
  Lecturer: 'Lecturer',
}

const TONES: Record<EvaluationStatus, StatusTone> = {
  Due: 'due',
  Overdue: 'overdue',
  'Not Due': 'ok',
  Unknown: 'unknown',
}

const STATUS_LABELS: Record<EvaluationStatus, string> = {
  Due: 'Due this semester',
  Overdue: 'Overdue',
  'Not Due': 'Up to date',
  Unknown: 'Unknown',
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

/** ISO-ish sort key for the next due term; unknown terms sort last. */
function nextDueSortKey(p: ProfessorEvaluationStatus) {
  if (p.next_due_year === null) return '9999'
  return `${p.next_due_year}-${p.next_due_semester === 'Fall' ? '08' : '01'}`
}

export function toFacultyMember(p: ProfessorEvaluationStatus): FacultyMember {
  const nextTerm = p.next_due_year !== null ? `${p.next_due_semester ?? ''} ${p.next_due_year}`.trim() : '—'
  return {
    id: p.professor_id,
    name: p.name,
    email: '',
    level: LEVELS[p.current_level ?? ''] ?? 'Lecturer',
    courses: [],
    observationsReceived: null,
    status: STATUS_LABELS[p.status],
    statusTone: TONES[p.status],
    nextEvaluationDate: nextDueSortKey(p),
    dueThisCycle: p.status === 'Due' || p.status === 'Overdue',
    unmatched: false,
    needsObserver: false,
    details: {
      past: [],
      upcoming: [],
      hireLevel: p.current_level ?? '—',
      cycle: p.frequency_years ? `Every ${p.frequency_years === 1 ? 'year' : `${p.frequency_years} years`}` : '—',
      lastEvaluation: p.last_evaluation_date ? formatDate(p.last_evaluation_date) : 'Never',
      nextEvaluation: nextTerm,
      instructorLevels: [],
      canObserveThem: [],
      theyCanObserve: [],
    },
  }
}

export async function getFaculty(signal?: AbortSignal): Promise<{ term: CurrentTerm; members: FacultyMember[] }> {
  const { current_term, professors } = await getEvaluationStatuses(undefined, signal)
  return { term: current_term, members: professors.map(toFacultyMember) }
}
