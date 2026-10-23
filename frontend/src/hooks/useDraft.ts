import { useState } from 'react'

/** Holds saved settings plus an editable draft, for the Save / Discard buttons. */
export default function useDraft<T extends object>(initial: T) {
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const set = <K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value }))
  return {
    draft,
    set,
    dirty: JSON.stringify(saved) !== JSON.stringify(draft),
    save: () => setSaved(draft),
    discard: () => setDraft(saved),
    replace: (next: T) => {
      setSaved(next)
      setDraft(next)
    },
  }
}
