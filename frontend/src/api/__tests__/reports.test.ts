import { describe, expect, it } from 'vitest'
import type { ObservationSummary } from '../observations'
import { reportStatus } from '../reports'

const observation = (overrides: Partial<ObservationSummary>) =>
  ({ status: 'Scheduled', observation_date: '2026-11-06', observer_signed: false, observee_signed: false, not_held: false, ...overrides }) as ObservationSummary

describe('reportStatus', () => {
  const today = '2026-11-06'

  it('is not overdue before or on the observation day', () => {
    expect(reportStatus(observation({ observation_date: '2026-11-07' }), today)).toBe('Scheduled')
    expect(reportStatus(observation({ observation_date: today }), today)).toBe('Scheduled')
  })

  it('is overdue the day after the observation', () => {
    expect(reportStatus(observation({ observation_date: '2026-11-05' }), today)).toBe('Report overdue')
  })

  it('awaits sign-off with one signature on or after the observation day', () => {
    expect(reportStatus(observation({ observation_date: today, observer_signed: true }), today)).toBe('Awaiting sign-off')
    expect(reportStatus(observation({ observation_date: '2026-11-05', observee_signed: true }), today)).toBe('Awaiting sign-off')
  })
})
