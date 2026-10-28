import { useCallback, useEffect } from 'react'
import { getEligibleObservers, getObserveeSignup } from '../api/signups'
import type { ObserverMatches, SignupWithObservers } from '../api/signups'
import { useAlert } from './useAlert'
import type { AlertOptions, Alerts } from './useAlert'

/** The backend returns at most this many observers (observer_matching.py MAX_MATCHES). */
export const FULL_MATCH_COUNT = 5

/** True when fewer observers qualified than a full match list. */
export function hasFewMatches(matches: ObserverMatches): boolean {
  return matches.observers.length < FULL_MATCH_COUNT
}

function alertIfFewMatches(showAlert: Alerts['showAlert'], matches: ObserverMatches, who: string) {
  if (!hasFewMatches(matches)) return
  const count = matches.observers.length
  showAlert({
    variant: count === 0 ? 'error' : 'warning',
    title: count === 0 ? 'No observers matched' : 'Few observers matched',
    message:
      count === 0
        ? `No eligible observers found for ${who}.`
        : `Only ${count} of ${FULL_MATCH_COUNT} potential observers found for ${who}.`,
  })
}

/**
 * Observer matching calls that also pop up an alert when fewer than 5
 * potential observers come back. Use inside <AlertProvider>.
 */
export function useObserverMatching() {
  const { showAlert } = useAlert()

  const fetchEligibleObservers = useCallback(
    async (signupId: number, signal?: AbortSignal) => {
      const result = await getEligibleObservers(signupId, signal)
      alertIfFewMatches(showAlert, result, `${result.faculty_name} · ${result.course_code}`)
      return result
    },
    [showAlert],
  )

  /** The professor's sign-up this cycle with its observers. Throws ApiError 404 if they haven't signed up. */
  const fetchObserveeSignup = useCallback(
    async (professorId: number, signal?: AbortSignal) => {
      const result = await getObserveeSignup(professorId, undefined, signal)
      alertIfFewMatches(showAlert, result, `${result.professor_name} · ${result.course_code}`)
      return result
    },
    [showAlert],
  )

  return { fetchEligibleObservers, fetchObserveeSignup }
}

// Remembers which sign-ups already got the "list is ready" alert this browser session.
const READY_ALERTED_KEY = 'assessment-helper-observer-list-ready'

function alreadyAlerted(signupId: number): boolean {
  try {
    return (sessionStorage.getItem(READY_ALERTED_KEY) ?? '').split(',').includes(String(signupId))
  } catch {
    return false
  }
}

function markAlerted(signupId: number) {
  try {
    const seen = sessionStorage.getItem(READY_ALERTED_KEY)
    sessionStorage.setItem(READY_ALERTED_KEY, seen ? `${seen},${signupId}` : String(signupId))
  } catch {
    // Storage unavailable; the alert may show again after a refresh.
  }
}

/** The alert telling a faculty member their potential observer list is ready. */
export function observerListReadyAlert(
  signup: Pick<SignupWithObservers, 'observers' | 'course_code' | 'section_name'>,
): AlertOptions {
  const count = signup.observers.length
  return {
    variant: 'success',
    title: 'Your observer list is ready',
    message: `${count} potential observer${count === 1 ? '' : 's'} matched for ${signup.course_code}.${signup.section_name}.`,
  }
}

/**
 * Tells a faculty member their potential observer list is ready: once their
 * sign-up this cycle has matched observers, pops up an alert (once per session).
 * Pass null until the logged-in professor's backend ID is known.
 */
export function useObserverListReadyAlert(professorId: number | null) {
  const { showAlert } = useAlert()

  useEffect(() => {
    if (professorId === null) return
    const controller = new AbortController()
    getObserveeSignup(professorId, undefined, controller.signal)
      .then((signup) => {
        if (signup.observers.length === 0 || alreadyAlerted(signup.signup_id)) return
        markAlerted(signup.signup_id)
        showAlert(observerListReadyAlert(signup))
      })
      // No sign-up yet (404) or the request failed: there's no list to announce.
      .catch(() => {})
    return () => controller.abort()
  }, [professorId, showAlert])
}
