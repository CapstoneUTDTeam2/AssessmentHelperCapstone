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
