// Builds Faculty page rows from the evaluation-status API. The backend only
// knows name, level and evaluation timing so far; courses, email, observation
// progress and observer matches stay empty until their endpoints exist.

import type { FacultyLevel, FacultyMember, StatusTone } from '../data/facultyMock'
import { getCourses } from './courses'
import { getEvaluationStatuses } from './evaluationStatus'
import { getObserverAlerts } from './observerSelection'
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
  Due: 'Due',
  Overdue: 'Overdue',
  'Not Due': 'Up to date',
  Unknown: 'Unknown',
}

/** Tester Faculty: Not Due shows the due semester; Due and Overdue stay as status only. */
export function evaluationStatusLabel(p: ProfessorEvaluationStatus): string {
  const term = p.next_due_year != null ? `${p.next_due_semester ?? ''} ${p.next_due_year}`.trim() : ''
  if (p.status === 'Not Due' && term) return `Due ${term}`
  return STATUS_LABELS[p.status]
}

/** Professors.CurrentLevel ("Associate Professor") as the short label the tables use. */
export function facultyLevel(currentLevel: string | null): FacultyLevel {
  return LEVELS[currentLevel ?? ''] ?? 'Lecturer'
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

/** ISO-ish sort key for the next due term; unknown terms sort last. */
function nextDueSortKey(p: ProfessorEvaluationStatus) {
  if (p.next_due_year === null) return '9999'
  return `${p.next_due_year}-${p.next_due_semester === 'Fall' ? '08' : '01'}`
}

export function toFacultyMember(p: ProfessorEvaluationStatus, dueSemester = false): FacultyMember {
  const nextTerm = p.next_due_year !== null ? `${p.next_due_semester ?? ''} ${p.next_due_year}`.trim() : '—'
  return {
    id: p.professor_id,
    name: p.name,
    email: '',
    level: facultyLevel(p.current_level),
    courses: [],
    observationsReceived: null,
    status: dueSemester ? evaluationStatusLabel(p) : STATUS_LABELS[p.status],
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

export async function getFaculty(
  signal?: AbortSignal,
  options?: { dueSemester?: boolean },
): Promise<{ term: CurrentTerm; members: FacultyMember[] }> {
  const [{ current_term, professors }, catalog, alerts] = await Promise.all([
    getEvaluationStatuses(undefined, signal),
    getCourses(signal).catch(() => null),
    getObserverAlerts(signal).catch(() => null),
  ])
  const unmatchedIds = new Set((alerts?.alerts ?? []).filter((a) => a.level === 'none').map((a) => a.professor_id))
  const lowIds = new Set((alerts?.alerts ?? []).filter((a) => a.level === 'low').map((a) => a.professor_id))
  const coursesByProfessor = new Map<number, string[]>()
  for (const course of catalog?.courses ?? []) {
    for (const section of course.sections) {
      for (const instructor of section.instructors) {
        const list = coursesByProfessor.get(instructor.professor_id) ?? []
        if (!list.includes(course.course_code)) list.push(course.course_code)
        coursesByProfessor.set(instructor.professor_id, list)
      }
    }
  }
  return {
    term: current_term,
    members: professors.map((professor) => {
      const member = toFacultyMember(professor, options?.dueSemester)
      member.courses = coursesByProfessor.get(professor.professor_id) ?? []
      member.unmatched = unmatchedIds.has(professor.professor_id)
      member.needsObserver = unmatchedIds.has(professor.professor_id) || lowIds.has(professor.professor_id)
      return member
    }),
  }
}
