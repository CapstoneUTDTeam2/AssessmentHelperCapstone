import { createContext, useContext } from 'react'

export type AlertVariant = 'success' | 'error' | 'warning' | 'info'

export interface AlertOptions {
  message: string
  /** Bold line above the message. */
  title?: string
  variant?: AlertVariant
}

/** Pops up alerts at the top middle of the screen, shared by every page in both flows. */
export interface Alerts {
  /** Shows an alert for 10 seconds, or until its X is clicked. Returns its id. */
  showAlert: (alert: AlertOptions) => number
  dismissAlert: (id: number) => void
}

export const AlertContext = createContext<Alerts | null>(null)

export function useAlert(): Alerts {
  const alerts = useContext(AlertContext)
  if (!alerts) throw new Error('useAlert must be used inside <AlertProvider>')
  return alerts
}
