import { useCallback, useEffect } from 'react'
import { getObserveeNotifications } from '../api/observerSelection'
import type { ObserveeNotification } from '../api/observerSelection'
import { getEligibleObservers, getObserveeSignup } from '../api/signups'
import type { ObserverMatches } from '../api/signups'
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

// Remembers which notifications already popped up this browser session.
const ALERTED_KEY = 'assessment-helper-notifications-shown'

function alreadyAlerted(key: string): boolean {
  try {
    return (sessionStorage.getItem(ALERTED_KEY) ?? '').split(',').includes(key)
  } catch {
    return false
  }
}

function markAlerted(key: string) {
  try {
    const seen = sessionStorage.getItem(ALERTED_KEY)
    sessionStorage.setItem(ALERTED_KEY, seen ? `${seen},${key}` : key)
  } catch {
    // Storage unavailable; the alert may show again after a refresh.
  }
}

/** The alert for one committee notification (GET /api/observees/{id}/notifications). */
export function notificationAlert(notification: ObserveeNotification): AlertOptions {
  if (notification.type === 'survey_open') {
    return { variant: 'info', title: 'Post-observation survey', message: notification.message }
  }
  return { variant: 'success', title: 'Your observer list is ready', message: notification.message }
}

/**
 * Pops up the committee's notifications for a faculty member, once per browser
 * session each: "your observer list is ready" after the committee sends the
 * lists, and the survey notice after the observation period.
 * Pass null until the logged-in professor's backend ID is known.
 */
export function useObserveeNotificationAlerts(professorId: number | null) {
  const { showAlert } = useAlert()

  useEffect(() => {
    if (professorId === null) return
    const controller = new AbortController()
    getObserveeNotifications(professorId, controller.signal)
      .then(({ notifications }) => {
        for (const notification of notifications) {
          const key = `${notification.type}-${notification.signup_id}`
          if (alreadyAlerted(key)) continue
          markAlerted(key)
          showAlert(notificationAlert(notification))
        }
      })
      // Unknown professor or the request failed: nothing to announce.
      .catch(() => {})
    return () => controller.abort()
  }, [professorId, showAlert])
}
