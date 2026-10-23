import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getObserveeClasses } from '../api/classes'
import type { ObserveeClass } from '../api/classes'
import { ApiError } from '../api/client'
import { getCurrentCycle } from '../api/cycles'
import type { EvaluationCycle } from '../api/cycles'
import { createSignup, getObserveeSignupOrNull } from '../api/signups'
import type { ObserveeSignup } from '../api/signups'
import { loggedInProfessorId } from '../auth/session'
import { SignupContext } from '../hooks/useSignups'

function SignupProvider({ children }: { children: ReactNode }) {
  const professorId = loggedInProfessorId()
  const [classes, setClasses] = useState<ObserveeClass[]>([])
  const [cycle, setCycle] = useState<EvaluationCycle | null>(null)
  const [signup, setSignup] = useState<ObserveeSignup | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (professorId === null) return
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      getObserveeClasses(professorId, controller.signal),
      getCurrentCycle(controller.signal),
      getObserveeSignupOrNull(professorId, controller.signal).catch((err: unknown) => {
        if (controller.signal.aborted) return null
        if (err instanceof ApiError && err.status === 404) return null
        setError(err instanceof Error ? err.message : 'Could not load existing signup')
        return null
      }),
    ])
      .then(([taught, currentCycle, existing]) => {
        setClasses(taught.classes)
        setCycle(currentCycle)
        setSignup(existing)
        if (existing) setError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to load signup data')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [professorId, tick])

  const submitObserved = useCallback(
    async (sectionId: number, dates: string[]) => {
      if (professorId === null) return
      const created = await createSignup({
        professor_id: professorId,
        section_id: sectionId,
        preferred_dates: dates,
        cycle_id: cycle?.cycle_id,
      })
      setSignup(created)
    },
    [professorId, cycle],
  )

  const value = useMemo(
    () => ({
      professorId,
      classes,
      cycle,
      signup,
      loading,
      error,
      submitObserved,
      refresh: () => setTick((n) => n + 1),
    }),
    [professorId, classes, cycle, signup, loading, error, submitObserved],
  )

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>
}

export default SignupProvider
