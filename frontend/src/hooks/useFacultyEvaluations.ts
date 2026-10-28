import { useCallback, useEffect, useState } from 'react'
import { getProfessorEvaluationStatus } from '../api/evaluationStatus'
import type { ProfessorEvaluationStatusDetail } from '../api/evaluationStatus'
import { getProfessorObservations } from '../api/observations'
import type { ProfessorObservations } from '../api/observations'
import { getAcceptedConfirmations, getIncomingRequests, getSignupRequests } from '../api/observerRequests'
import type { IncomingRequests, ObserverRequest, SignupRequests } from '../api/observerRequests'
import { getSignupObserverList } from '../api/observerSelection'
import type { ListedObserver } from '../api/observerSelection'
import { getProfessorSurveys } from '../api/surveys'
import type { ProfessorSurveys } from '../api/surveys'

/** Everything the faculty pages show about one professor's evaluations this cycle. */
export interface FacultyEvaluations {
  status: ProfessorEvaluationStatusDetail | null
  observations: ProfessorObservations | null
  /** Requests other observees sent to this professor as an observer. */
  incoming: IncomingRequests | null
  accepted: (ObserverRequest & { selected: boolean })[]
  /** This professor's own signup: requests they sent, and their saved observer list. */
  sent: SignupRequests | null
  observerList: ListedObserver[]
  surveys: ProfessorSurveys | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Loads a professor's observations, observer requests (both directions) and surveys.
 * Each piece fails on its own, so one missing endpoint doesn't blank the page.
 */
export function useFacultyEvaluations(professorId: number | null, signupId: number | null): FacultyEvaluations {
  const [data, setData] = useState<Omit<FacultyEvaluations, 'loading' | 'error' | 'reload'>>({
    status: null,
    observations: null,
    incoming: null,
    accepted: [],
    sent: null,
    observerList: [],
    surveys: null,
  })
  const [loading, setLoading] = useState(professorId !== null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (professorId === null) return
    const controller = new AbortController()
    const { signal } = controller
    const failed: string[] = []
    const soft = <T,>(promise: Promise<T>, what: string) =>
      promise.catch(() => {
        if (!signal.aborted) failed.push(what)
        return null
      })
    Promise.all([
      soft(getProfessorEvaluationStatus(professorId, signal), 'evaluation status'),
      soft(getProfessorObservations(professorId, signal), 'observations'),
      soft(getIncomingRequests(professorId, signal), 'observation requests'),
      soft(getAcceptedConfirmations(professorId, signal), 'confirmations'),
      signupId === null ? null : soft(getSignupRequests(signupId, signal), 'your requests'),
      signupId === null ? null : soft(getSignupObserverList(signupId, signal), 'your observer list'),
      soft(getProfessorSurveys(professorId, signal), 'surveys'),
    ]).then(([status, observations, incoming, accepted, sent, list, surveys]) => {
      if (signal.aborted) return
      setData({
        status,
        observations,
        incoming,
        accepted: accepted?.accepted ?? [],
        sent,
        observerList: list?.observers ?? [],
        surveys,
      })
      setError(failed.length ? `Couldn’t load ${failed.join(', ')}.` : null)
      setLoading(false)
    })
    return () => controller.abort()
  }, [professorId, signupId, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...data, loading, error, reload }
}
