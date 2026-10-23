// The observed faculty member's sign-off on a report about their class.
// Kept per browser until the sign-off API exists.

export interface Signoff {
  /** ISO date the observed faculty member signed. */
  signedOn: string
  /** Optional response added when signing. */
  response: string
}

const signoffKey = (id: number) => `assessment-helper-signoff-${id}`

export function loadSignoff(id: number): Signoff | null {
  try {
    const raw = sessionStorage.getItem(signoffKey(id))
    return raw ? (JSON.parse(raw) as Signoff) : null
  } catch {
    return null
  }
}

export function storeSignoff(id: number, signoff: Signoff) {
  try {
    sessionStorage.setItem(signoffKey(id), JSON.stringify(signoff))
  } catch {
    // Storage unavailable; the sign-off just won't survive leaving the page.
  }
}
