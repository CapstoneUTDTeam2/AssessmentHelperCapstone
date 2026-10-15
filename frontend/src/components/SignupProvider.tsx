import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SignupContext } from '../hooks/useSignups'
import type { ObserveAvailability } from './ObserveSignupDialog'
import type { ObservedSignup } from './ObservedSignupDialog'

/** Keeps sign-ups while moving between pages. Placeholder until the sign-up API is wired up. */
function SignupProvider({ children }: { children: ReactNode }) {
  const [observing, setObserving] = useState<ObserveAvailability | null>(null)
  const [observed, setObserved] = useState<ObservedSignup | null>(null)
  const value = useMemo(() => ({ observing, observed, setObserving, setObserved }), [observing, observed])
  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>
}

export default SignupProvider
