// Builds Reports page rows: one per observation this cycle, plus signups that
// have no observer yet.

import type { FacultyLevel } from '../data/facultyMock'
import { getCurrentCycle } from './cycles'
import type { EvaluationCycle } from './cycles'
import { facultyLevel } from './faculty'
import { getUnmatchedFaculty } from './kpis'
import { listObservations } from './observations'
import type { ObservationSummary } from './observations'

export type ReportStatus = 'Scheduled' | 'Awaiting sign-off' | 'Signed off' | 'Report overdue' | 'No report'

export interface ReportRow {
  /** Row key: observation id, or `u<signup id>` for a signup with no observer. */
  id: string
  /** Null for a signup with no observer (nothing to open). */
  observationId: number | null
  professor: string
  level: FacultyLevel
  /** Avatar circle color from the design. */
  avatar: 'orange' | 'green'
  /** e.g. "CS 1337.001"; null when no observation exists yet. */
  reportType: string | null
  /** e.g. "Observed by Robert Smith", or why there is no observer. */
  reportDetail: string
  /** ISO observation date (scheduled or held), or null. */
  date: string | null
  observerSigned: boolean
  observeeSigned: boolean
  status: ReportStatus
}

function reportStatus(o: ObservationSummary, today: string): ReportStatus {
  if (o.status === 'Completed') return 'Signed off'
  if (!o.observation_date || o.observation_date > today) return 'Scheduled'
  // The observation date passed: one signature means the form is filled in and waiting on the other person.
  return o.observer_signed || o.observee_signed ? 'Awaiting sign-off' : 'Report overdue'
}

export async function getReports(signal?: AbortSignal): Promise<{ cycle: EvaluationCycle | null; rows: ReportRow[] }> {
  const [cycle, observations, unmatched] = await Promise.all([
    getCurrentCycle(signal).catch(() => null),
    listObservations(undefined, signal),
    getUnmatchedFaculty(undefined, signal).catch(() => null),
  ])
  const today = cycle?.today ?? new Date().toISOString().slice(0, 10)
  const rows: ReportRow[] = observations.observations.map((o) => ({
    id: String(o.observation_id),
    observationId: o.observation_id,
    professor: o.observee_name,
    level: facultyLevel(o.observee_level),
    avatar: o.observation_id % 2 ? 'orange' : 'green',
    reportType: `${o.course_code}.${o.section_name}`,
    reportDetail: `Observed by ${o.observer_name}`,
    date: o.observation_date,
    observerSigned: o.observer_signed,
    observeeSigned: o.observee_signed,
    status: reportStatus(o, today),
  }))
  for (const u of unmatched?.faculty ?? []) {
    rows.push({
      id: `u${u.signup_id}`,
      observationId: null,
      professor: u.professor_name,
      level: facultyLevel(u.hire_level),
      avatar: u.signup_id % 2 ? 'orange' : 'green',
      reportType: null,
      reportDetail: `${u.reason} · ${u.course_code}.${u.section_name}`,
      date: null,
      observerSigned: false,
      observeeSigned: false,
      status: 'No report',
    })
  }
  return { cycle, rows }
}
