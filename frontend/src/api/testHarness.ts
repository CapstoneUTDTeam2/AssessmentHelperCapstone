// Local tester APIs. Not Assessment Committee / Observee / Observer process.

import { apiGet, apiPost, apiPut } from './client'
import { getCourses } from './courses'
import type { EvaluationCycle } from './cycles'

export const TEST_RANKS = [
  'Assistant Professor',
  'Associate Professor',
  'Full Professor',
] as const

export type TestRank = (typeof TEST_RANKS)[number]

export interface AcademicTermOption {
  term_id: number
  semester: string
  year: number
}

export interface TestClock {
  now: string
  frozen: boolean
  timezone: string
}

export interface TestHarness extends TestClock {
  current_cycle: EvaluationCycle
  ranks: TestRank[]
  terms: AcademicTermOption[]
}

export interface TestProfessor {
  professor_id: number
  name: string
  current_level: string | null
  start_term_id: number | null
  email: string | null
  is_ac: boolean
}

export function getTestHarness(signal?: AbortSignal) {
  return apiGet<TestHarness>('/api/test/harness', undefined, signal)
}

export function setTestClock(frozenAt: string | null, signal?: AbortSignal) {
  return apiPut<TestClock>('/api/test/clock', { frozen_at: frozenAt }, undefined, signal)
}

export function setTestProfessor(
  professorId: number,
  body: { current_level?: string | null },
  signal?: AbortSignal,
) {
  return apiPut<TestProfessor>(`/api/test/professors/${professorId}`, body, undefined, signal)
}

export interface RandomizeUnknownsResult {
  unknown_before: number
  filled: number
  past_observations: number
  start_terms_repaired: number
  availability_seeded: number
  current_signups_cleared: number
  current_observations_cleared: number
  current_requests_cleared: number
}

export function randomizeUnknowns(signal?: AbortSignal) {
  return apiPost<RandomizeUnknownsResult>('/api/test/randomize-unknowns', undefined, undefined, signal)
}

export function advanceTestDays(days: number, signal?: AbortSignal) {
  return apiPost<TestClock>('/api/test/advance-days', { days }, undefined, signal)
}

export interface DemoPairPerson {
  professor_id: number
  name: string
  department: string
  status: string
  section_id: number
  section_name: string
  course_code: string
  course_name: string
  course_level: number
  meeting_days: string | null
  start_time: string | null
  end_time: string | null
}

export interface DemoPair {
  cycle_id: number
  semester: string
  year: number
  pair: { a: DemoPairPerson; b: DemoPairPerson } | null
}

export function getDemoPair(signal?: AbortSignal) {
  return apiGet<DemoPair>('/api/test/demo-pair', undefined, signal)
}

/** datetime-local value from an API ISO timestamp. */
export function toDateTimeLocal(iso: string) {
  const trimmed = iso.replace('Z', '').slice(0, 16)
  return trimmed.includes('T') ? trimmed : `${trimmed}T00:00`
}

/** One this-term instructor, for tester login. Not a process role. */
export async function pickRandomThisTermInstructor(signal?: AbortSignal) {
  const body = await getCourses(signal)
  const byId = new Map<number, string>()
  for (const course of body.courses) {
    for (const section of course.sections) {
      for (const instructor of section.instructors) {
        byId.set(instructor.professor_id, instructor.professor_name)
      }
    }
  }
  const rows = [...byId.entries()]
  if (rows.length === 0) return null
  const [professor_id, professor_name] = rows[Math.floor(Math.random() * rows.length)]
  return { professor_id, professor_name }
}
