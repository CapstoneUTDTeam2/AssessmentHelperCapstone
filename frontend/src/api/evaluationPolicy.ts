// Evaluation policy (backend/app/api/evaluation_policy.py). The committee can change it,
// but a cycle that has started keeps its rules; changes then go to the next cycle.

import { apiGet, apiPut } from './client'

export interface PolicyValues {
  assistant_frequency_years: number
  senior_frequency_years: number
  signups_per_cycle: number
  max_observers: number
}

export interface Policy extends PolicyValues {
  /** True when no cycle has saved its own policy yet (process defaults). */
  is_default: boolean
}

interface PolicyCycle {
  cycle_id: number
  semester: string
  year: number
  policy: Policy
}

export interface EvaluationPolicyState {
  current: PolicyCycle & { started: boolean }
  /** The cycle a change applies to; null when the current cycle started and no next cycle exists. */
  editable: PolicyCycle | null
}

export function getEvaluationPolicy(signal?: AbortSignal) {
  return apiGet<EvaluationPolicyState>('/api/evaluation-policy', undefined, signal)
}

export function updateEvaluationPolicy(body: PolicyValues, signal?: AbortSignal) {
  return apiPut<EvaluationPolicyState>('/api/evaluation-policy', body, undefined, signal)
}

export function policyValues(policy: Policy): PolicyValues {
  const { assistant_frequency_years, senior_frequency_years, signups_per_cycle, max_observers } = policy
  return { assistant_frequency_years, senior_frequency_years, signups_per_cycle, max_observers }
}
