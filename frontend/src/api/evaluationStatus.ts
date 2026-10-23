// Evaluation-cycle status from the backend (backend/app/api/evaluation_cycle.py).
// Status values come from the ProfessorEvaluationStatus SQL view.

import { apiGet } from './client'

export type EvaluationStatus = 'Due' | 'Overdue' | 'Not Due' | 'Unknown'

export interface CurrentTerm {
  semester: 'Spring' | 'Fall'
  year: number
}

export interface ProfessorEvaluationStatus {
  professor_id: number
  name: string
  current_level: string | null
  frequency_years: number | null
  /** ISO date (YYYY-MM-DD), or null if never evaluated. */
  last_evaluation_date: string | null
  next_due_year: number | null
  next_due_semester: string | null
  status: EvaluationStatus
}

export interface EvaluationStatusList {
  current_term: CurrentTerm
  professors: ProfessorEvaluationStatus[]
}

export type ProfessorEvaluationStatusDetail = ProfessorEvaluationStatus & {
  current_term: CurrentTerm
}

/** All professors, optionally filtered to one status. */
export function getEvaluationStatuses(status?: EvaluationStatus, signal?: AbortSignal) {
  return apiGet<EvaluationStatusList>('/api/evaluation-status', { status }, signal)
}

/** Professors whose evaluation is due this cycle. */
export function getDueProfessors(signal?: AbortSignal) {
  return apiGet<EvaluationStatusList>('/api/evaluation-status/due', undefined, signal)
}

/** Professors whose evaluation is overdue. */
export function getOverdueProfessors(signal?: AbortSignal) {
  return apiGet<EvaluationStatusList>('/api/evaluation-status/overdue', undefined, signal)
}

/** One professor's status. Throws ApiError with status 404 if not found. */
export function getProfessorEvaluationStatus(professorId: number, signal?: AbortSignal) {
  return apiGet<ProfessorEvaluationStatusDetail>(`/api/evaluation-status/${professorId}`, undefined, signal)
}

export interface LevelCount {
  /** Professors.CurrentLevel, or "Unknown" when it isn't set. */
  level: string
  count: number
}

export interface FacultySummary {
  totalFaculty: number
  countByRank: LevelCount[]
}

/** Counts professors per CurrentLevel, in first-seen order. */
export function countByLevel(professors: ProfessorEvaluationStatus[]): LevelCount[] {
  const counts = new Map<string, number>()
  for (const p of professors) {
    const level = p.current_level ?? 'Unknown'
    counts.set(level, (counts.get(level) ?? 0) + 1)
  }
  return [...counts].map(([level, count]) => ({ level, count }))
}

/** "Faculty summary": built from the full status list, since there is no summary route. */
export async function getFacultySummary(signal?: AbortSignal): Promise<FacultySummary> {
  const { professors } = await getEvaluationStatuses(undefined, signal)
  return { totalFaculty: professors.length, countByRank: countByLevel(professors) }
}

/** "Faculty due by hire level": professors with EvaluationStatus = Due, grouped by CurrentLevel. */
export async function getDueCountByLevel(signal?: AbortSignal): Promise<LevelCount[]> {
  const { professors } = await getDueProfessors(signal)
  return countByLevel(professors)
}
