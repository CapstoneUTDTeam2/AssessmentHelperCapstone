import { createContext, useContext } from 'react'
import type { ObserveeClass } from '../api/classes'
import type { EvaluationCycle } from '../api/cycles'
import type { ObserveeSignup } from '../api/signups'

/** Observee signup for this cycle, shared by the faculty Dashboard and Evaluations pages. */
export interface Signups {
  professorId: number | null
  classes: ObserveeClass[]
  cycle: EvaluationCycle | null
  signup: ObserveeSignup | null
  loading: boolean
  error: string | null
  submitObserved: (sectionId: number, dates: string[]) => Promise<void>
  refresh: () => void
}

export const SignupContext = createContext<Signups | null>(null)

export function useSignups(): Signups {
  const signups = useContext(SignupContext)
  if (!signups) throw new Error('useSignups must be used inside <SignupProvider>')
  return signups
}
