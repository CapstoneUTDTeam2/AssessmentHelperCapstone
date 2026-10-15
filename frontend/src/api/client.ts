// Thin fetch wrapper for the FastAPI backend. Paths are relative ("/api/...");
// in dev, Vite proxies them to the backend (see vite.config.ts).

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

type Query = Record<string, string | number | undefined>

export async function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  const res = await fetch(qs ? `${path}?${qs}` : path, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    // FastAPI errors look like {"detail": ...}; fall back to the status text.
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? res.statusText)
  }
  return res.json() as Promise<T>
}
