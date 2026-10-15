import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  description: ReactNode
  children: ReactNode
  submitLabel: string
  canSubmit: boolean
  /** Shown at the left of the footer, e.g. why the form can't be submitted. */
  footerNote?: ReactNode
  onClose: () => void
  onSubmit: () => void
}

/**
 * Modal form built on <dialog>, which handles focus and Esc. Render it only
 * while open; it opens on mount.
 */
function Modal({ title, description, children, submitLabel, canSubmit, footerNote, onClose, onSubmit }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby={titleId}
      className="m-auto max-h-[90vh] w-[min(720px,calc(100vw-32px))] overflow-hidden rounded-xl bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40"
    >
      <form
        method="dialog"
        className="flex max-h-[90vh] flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) onSubmit()
        }}
      >
        <header className="border-b border-neutral-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">{description}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <footer className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          {footerNote && <span className="mr-auto text-[11px]">{footerNote}</span>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

export default Modal
