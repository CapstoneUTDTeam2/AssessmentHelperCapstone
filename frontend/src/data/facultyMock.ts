// Row types for the Faculty page (built from the API in api/faculty.ts).

export type FacultyLevel = 'Assistant Prof.' | 'Associate Prof.' | 'Full Prof.' | 'Lecturer'

export type StatusTone = 'due' | 'overdue' | 'ok' | 'unknown'

export type EventKind = 'Observed' | 'Observing' | 'Evaluation'

export interface EvaluationEvent {
  date: string
  title: string
  subtitle: string
  kind: EventKind
}

export interface ObserverMatch {
  name: string
  rank: string
  detail: string
  courseLevel: string
}

export interface FacultyDetails {
  past: EvaluationEvent[]
  upcoming: EvaluationEvent[]
  hireLevel: string
  cycle: string
  lastEvaluation: string
  nextEvaluation: string
  instructorLevels: string[]
  canObserveThem: ObserverMatch[]
  theyCanObserve: ObserverMatch[]
}

export interface FacultyMember {
  id: number
  name: string
  email: string
  level: FacultyLevel
  courses: string[]
  /**
   * Peer observations received this cycle; null when not known yet. There is no
   * required count: the client has only set how often an evaluation is due.
   */
  observationsReceived: number | null
  status: string
  statusTone: StatusTone
  /** ISO date of the next evaluation, used for sorting. */
  nextEvaluationDate: string
  dueThisCycle: boolean
  unmatched: boolean
  needsObserver: boolean
  details: FacultyDetails
}
