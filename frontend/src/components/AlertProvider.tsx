import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertContext } from '../hooks/useAlert'
import type { AlertOptions, AlertVariant } from '../hooks/useAlert'

/** How long an alert stays up before closing itself. */
const ALERT_DURATION_MS = 10_000

interface ActiveAlert extends AlertOptions {
  id: number
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  success: 'border-l-[#1c4532]',
  error: 'border-l-[#b3261e]',
  warning: 'border-l-[#e0791a]',
  info: 'border-l-neutral-900',
}

function Alert({ alert, onDismiss }: { alert: ActiveAlert; onDismiss: (id: number) => void }) {
  const { id } = alert
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), ALERT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [id, onDismiss])

  const variant = alert.variant ?? 'info'
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto relative w-full rounded-lg border border-l-4 border-neutral-200 bg-white py-3 pr-10 pl-4 text-neutral-900 shadow-lg ${VARIANT_STYLES[variant]}`}
    >
      {alert.title && <p className="text-sm font-semibold">{alert.title}</p>}
      <p className="text-xs text-neutral-600">{alert.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss alert"
        className="absolute top-2 right-2 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  )
}

/** Holds the alerts on screen and renders them stacked at the top middle. */
function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  const nextId = useRef(0)

  const dismissAlert = useCallback((id: number) => {
    setAlerts((current) => current.filter((a) => a.id !== id))
  }, [])

  const showAlert = useCallback((alert: AlertOptions) => {
    const id = nextId.current++
    setAlerts((current) => [...current, { ...alert, id }])
    return id
  }, [])

  const value = useMemo(() => ({ showAlert, dismissAlert }), [showAlert, dismissAlert])

  return (
    <AlertContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 font-sans left-1/2 z-50 flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
        {alerts.map((alert) => (
          <Alert key={alert.id} alert={alert} onDismiss={dismissAlert} />
        ))}
      </div>
    </AlertContext.Provider>
  )
}

export default AlertProvider
