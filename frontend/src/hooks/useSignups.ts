import { createContext, useContext } from 'react'
import type { ObserveAvailability } from '../components/ObserveSignupDialog'
import type { ObservedSignup } from '../components/ObservedSignupDialog'

/** The faculty member's sign-ups this cycle, shared by the Dashboard and Evaluations pages. */
export interface Signups {
  /** Signed up to observe colleagues, with the days and hours they can do it. */
  observing: ObserveAvailability | null
  /** Signed up to be observed in one class on one day. */
  observed: ObservedSignup | null
  setObserving: (availability: ObserveAvailability) => void
  setObserved: (signup: ObservedSignup) => void
}

export const SignupContext = createContext<Signups | null>(null)

export function useSignups(): Signups {
  const signups = useContext(SignupContext)
  if (!signups) throw new Error('useSignups must be used inside <SignupProvider>')
  return signups
}
