// Process-doc KPIs and the executive dashboard (backend/app/api/kpis.py).
// Percentages are 0-100 with one decimal, or null when the denominator is 0.

import { apiGet } from './client'

export interface IncorrectMatch {
  signup_id: number
  observer_id: number
  reasons: string[]
}

export interface MissingObservation {
  observation_id: number
  signup_id: number
  observee: string
  observer: string
  planned_date: string | null
  status: string
}

export interface Kpis {
  cycle_id: number
  semester: string
  year: number
  evaluation_eligibility_accuracy: {
    total_matches: number
    correct_matches: number
    percent: number | null
    incorrect: IncorrectMatch[]
  }
  overdue_evaluation_count: { count: number }
  assessment_participation_rate: { signed_up: number; due: number; percent: number | null }
  observer_utilization_rate: { observers: number; signed_up: number; percent: number | null }
  list_sufficiency_rate: {
    saved_matches: number
    signups: number
    average_list_size: number | null
    percent_of_full_list: number | null
  }
  missing_observation_count: { count: number; observations: MissingObservation[] }
  survey_completion_rate: {
    completed_full_process: number
    submitted_surveys: number
    signups: number
    percent: number | null
  }
}

export interface UnmatchedFaculty {
  signup_id: number
  status: string
  professor_id: number
  professor_name: string
  hire_level: string | null
  course_code: string
  section_name: string
  eligible_count: number
  list_size: number
  requests_sent: number
  confirmed: number
  reason: string
}

/** Counts keyed by Professors.CurrentLevel ("Assistant Professor", ..., or "Unknown"). */
export type LevelCounts = Record<string, number>

export interface ExecutiveDashboard {
  cycle_id: number
  faculty_due_by_hire_level: LevelCounts
  faculty_overdue_by_hire_level: LevelCounts
  outstanding_reports_by_hire_level: LevelCounts
  unmatched_faculty_count: number
  unmatched_faculty: UnmatchedFaculty[]
}

export function getKpis(cycleId?: number, signal?: AbortSignal) {
  return apiGet<Kpis>('/api/kpis', { cycle_id: cycleId }, signal)
}

export function getExecutiveDashboard(cycleId?: number, signal?: AbortSignal) {
  return apiGet<ExecutiveDashboard>('/api/dashboard/executive', { cycle_id: cycleId }, signal)
}

export function getUnmatchedFaculty(cycleId?: number, signal?: AbortSignal) {
  return apiGet<{ cycle_id: number; count: number; faculty: UnmatchedFaculty[] }>(
    '/api/reports/unmatched-faculty',
    { cycle_id: cycleId },
    signal,
  )
}

/** "87.5%" or "—" for a KPI with nothing to divide by. */
export function formatPercent(percent: number | null) {
  return percent === null ? '—' : `${Math.round(percent)}%`
}
