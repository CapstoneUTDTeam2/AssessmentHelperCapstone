// Runs the API services against the real backend and checks every response
// against the frontend types. Start it first: `docker compose up`.
// Only calls that read, or that the backend rejects, are made, plus one deadline
// update that re-saves the current dates, so the database is left unchanged.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../client'
import { getCourse, getCourseSummary, listCourses } from '../courses'
import {
  deadlineDate,
  getCurrentEvaluationCycle,
  getEvaluationCycle,
  getServerDate,
  listEvaluationCycles,
  updateCycleDeadlines,
  type EvaluationCycle,
} from '../evaluationCycles'
import {
  getDueCountByLevel,
  getEvaluationStatuses,
  getFacultySummary,
  getProfessorEvaluationStatus,
} from '../evaluationStatus'
import { getCurrentClasses, getTeachingHistory } from '../observees'
import { createSignup, getEligibleObservers, getObserveeSignup } from '../signups'
import { backendAvailable, shapeErrors, useLiveBackend, type Shape } from './liveBackend'

const DEADLINE: Shape = { key: 'string', label: 'string', date: 'string', is_open: 'boolean', days_left: 'number' }
const CYCLE: Shape = {
  cycle_id: 'number',
  term_id: 'number',
  semester: 'string',
  year: 'number',
  today: 'string',
  phase: 'string',
  next_deadline: 'object?',
  deadlines: 'array',
}
const TERM: Shape = { semester: 'string', year: 'number' }
const STATUS: Shape = {
  professor_id: 'number',
  name: 'string',
  current_level: 'string?',
  start_term_id: 'number?',
  frequency_years: 'number?',
  last_evaluation_date: 'string?',
  next_due_year: 'number?',
  next_due_semester: 'string?',
  status: 'string',
}
const INSTRUCTOR: Shape = { professor_id: 'number', professor_name: 'string' }
const CATALOG_SECTION: Shape = {
  section_id: 'number',
  section_name: 'string',
  meeting_days: 'string?',
  start_time: 'string?',
  end_time: 'string?',
  instructors: 'array',
}
const COURSE: Shape = {
  course_id: 'number',
  course_code: 'string',
  course_name: 'string',
  course_description: 'string?',
  sections: 'array',
}
const CLASS: Shape = {
  course_id: 'number',
  course_code: 'string',
  course_name: 'string',
  section_id: 'number',
  section_name: 'string',
  meeting_days: 'string?',
  start_time: 'string?',
  end_time: 'string?',
}
const TEACHING_TERM: Shape = {
  term_id: 'number',
  semester: 'string',
  year: 'number',
  courses: 'array',
  sections: 'number',
  classes: 'array',
}
const SIGNUP: Shape = {
  signup_id: 'number',
  cycle_id: 'number',
  professor_id: 'number',
  professor_name: 'string',
  section_id: 'number',
  section_name: 'string',
  course_code: 'string',
  course_name: 'string',
  preferred_times: 'string?',
  signup_date: 'string?',
  signup_time: 'string?',
  status: 'string',
  observers: 'array',
  insufficient: 'boolean',
}
const OBSERVER: Shape = { observer_id: 'number', name: 'string', department: 'string' }
const MATCH: Shape = {
  signup_id: 'number',
  faculty_id: 'number',
  faculty_name: 'string',
  department_id: 'number',
  department_name: 'string',
  course_id: 'number',
  course_code: 'string',
  course_name: 'string',
  course_level: 'number',
  section_id: 'number',
  meeting_days: 'string?',
  start_time: 'string?',
  end_time: 'string?',
  eligible_count: 'number',
  insufficient: 'boolean',
  observers: 'array',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^\d{2}:\d{2}$/
const MISSING_ID = 999999

function expectShape(value: unknown, shape: Shape) {
  expect(shapeErrors(value, shape)).toEqual([])
}

function expectEach(values: unknown[], shape: Shape) {
  for (const value of values) expectShape(value, shape)
}

async function expectApiError(promise: Promise<unknown>, status: number) {
  const error = await promise.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(status)
  return error as ApiError
}

describe.skipIf(!backendAvailable)('live backend', () => {
  let current: EvaluationCycle
  // A professor who teaches this term; most routes below need one.
  let professorId: number

  beforeAll(async () => {
    useLiveBackend()
    current = await getCurrentEvaluationCycle()
    const catalog = await listCourses()
    const instructor = catalog.courses.flatMap((c) => c.sections).flatMap((s) => s.instructors)[0]
    if (!instructor) throw new Error('Seed data has no instructors this term')
    professorId = instructor.professor_id
  })

  afterAll(() => vi.unstubAllGlobals())

  describe('evaluation cycles', () => {
    it('current cycle matches EvaluationCycle', () => {
      expectShape(current, CYCLE)
      expectEach(current.deadlines, DEADLINE)
      expect(current.deadlines.map((d) => d.key)).toEqual(['signup', 'observation', 'post_observation_feedback', 'app_feedback'])
      if (current.next_deadline) expectShape(current.next_deadline, DEADLINE)
      expect(['Spring', 'Fall']).toContain(current.semester)
      expect(current.today).toMatch(ISO_DATE)
    })

    it('lists cycles, including the current one', async () => {
      const cycles = await listEvaluationCycles()
      expectEach(cycles, CYCLE)
      expect(cycles.map((c) => c.cycle_id)).toContain(current.cycle_id)
    })

    it('gets one cycle, and 404s for a missing one', async () => {
      expect(await getEvaluationCycle(current.cycle_id)).toEqual(current)
      await expectApiError(getEvaluationCycle(MISSING_ID), 404)
    })

    it('server date is the campus date', async () => {
      expect(await getServerDate()).toBe(current.today)
    })

    it('re-saving the current deadlines returns the same cycle', async () => {
      const update = {
        signup: deadlineDate(current, 'signup')!,
        observation: deadlineDate(current, 'observation')!,
      }
      const updated = await updateCycleDeadlines(current.cycle_id, update)
      expectShape(updated, CYCLE)
      expect(updated.deadlines).toEqual(current.deadlines)
    })

    it('rejects an empty or out-of-order deadline update', async () => {
      await expectApiError(updateCycleDeadlines(current.cycle_id, {}), 400)
      const error = await expectApiError(
        updateCycleDeadlines(current.cycle_id, { signup: '2999-01-01' }),
        400,
      )
      expect(error.message).toMatch(/deadline/i)
      expect((await getCurrentEvaluationCycle()).deadlines).toEqual(current.deadlines)
    })
  })

  describe('evaluation status', () => {
    it('list matches ProfessorEvaluationStatus', async () => {
      const { current_term, professors } = await getEvaluationStatuses()
      expectShape(current_term, TERM)
      expect(professors.length).toBeGreaterThan(0)
      expectEach(professors, STATUS)
      for (const p of professors) expect(['Due', 'Overdue', 'Not Due', 'Unknown']).toContain(p.status)
    })

    it('one professor, and 404 for a missing one', async () => {
      const status = await getProfessorEvaluationStatus(professorId)
      expectShape(status, { ...STATUS, current_term: 'object' })
      await expectApiError(getProfessorEvaluationStatus(MISSING_ID), 404)
    })

    it('faculty summary counts every professor once', async () => {
      const { professors } = await getEvaluationStatuses()
      const summary = await getFacultySummary()
      expect(summary.totalFaculty).toBe(professors.length)
      expect(summary.countByRank.reduce((sum, r) => sum + r.count, 0)).toBe(professors.length)
    })

    it('due-by-level counts match the due list', async () => {
      const { professors } = await getEvaluationStatuses('Due')
      const byLevel = await getDueCountByLevel()
      expect(byLevel.reduce((sum, r) => sum + r.count, 0)).toBe(professors.length)
    })
  })

  describe('courses', () => {
    it('catalog matches CourseCatalog and is for the current term', async () => {
      const catalog = await listCourses()
      expect(catalog).toMatchObject({ semester: current.semester, year: current.year })
      expectEach(catalog.courses, COURSE)
      const sections = catalog.courses.flatMap((c) => c.sections)
      expectEach(sections, CATALOG_SECTION)
      expectEach(sections.flatMap((s) => s.instructors), INSTRUCTOR)
      for (const s of sections) {
        if (s.start_time) expect(s.start_time).toMatch(CLOCK)
        if (s.end_time) expect(s.end_time).toMatch(CLOCK)
      }
    })

    it('one course matches the catalog entry, and 404 for a missing one', async () => {
      const catalog = await listCourses()
      const first = catalog.courses[0]
      expect(await getCourse(first.course_id)).toEqual({ semester: catalog.semester, year: catalog.year, ...first })
      await expectApiError(getCourse(MISSING_ID), 404)
    })

    it('course summary matches the catalog', async () => {
      const catalog = await listCourses()
      const summary = await getCourseSummary()
      expect(summary).toEqual({
        term: `${current.semester} ${current.year}`,
        courseCount: catalog.courses.length,
        sectionCount: catalog.courses.reduce((sum, c) => sum + c.sections.length, 0),
      })
    })
  })

  describe('observee classes', () => {
    it('current classes match CurrentClasses', async () => {
      const result = await getCurrentClasses(professorId)
      expectShape(result, { professor_id: 'number', professor_name: 'string', semester: 'string', year: 'number', classes: 'array' })
      expect(result.classes.length).toBeGreaterThan(0)
      expectEach(result.classes, CLASS)
    })

    it('teaching history matches TeachingHistory, newest term first', async () => {
      const history = await getTeachingHistory(professorId)
      expectShape(history, { professor_id: 'number', professor_name: 'string', terms: 'array' })
      expectEach(history.terms, TEACHING_TERM)
      for (const term of history.terms) {
        expectEach(term.classes, CLASS)
        expect(term.sections).toBe(term.classes.length)
      }
      const order = history.terms.map((t) => t.year)
      expect(order).toEqual([...order].sort((a, b) => b - a))
    })

    it('404 for a missing professor', async () => {
      await expectApiError(getCurrentClasses(MISSING_ID), 404)
      await expectApiError(getTeachingHistory(MISSING_ID), 404)
    })
  })

  describe('signups', () => {
    it("observee's sign-up matches SignupWithObservers, or 404s", async () => {
      const result = await getObserveeSignup(professorId).catch((e: unknown) => e)
      if (result instanceof ApiError) {
        expect(result.status).toBe(404)
        return
      }
      expectShape(result, SIGNUP)
      expectEach((result as { observers: unknown[] }).observers, OBSERVER)
    })

    it('eligible observers match SignupMatchResult', async () => {
      const signup = await getObserveeSignup(professorId).catch(() => null)
      if (!signup) return
      const match = await getEligibleObservers(signup.signup_id)
      expectShape(match, MATCH)
      expectEach(match.observers, OBSERVER)
      expect(match.observers.length).toBeLessThanOrEqual(5)
      expect(match.insufficient).toBe(match.eligible_count === 0)
      await expectApiError(getEligibleObservers(MISSING_ID), 404)
    })

    it('rejects a sign-up for a missing section without inserting', async () => {
      // The section is checked before the deadline, so this is a 404 at any time of year.
      const error = await expectApiError(createSignup({ professor_id: professorId, section_id: MISSING_ID }), 404)
      expect(error.message).toBe('Section not found')
    })
  })
})
