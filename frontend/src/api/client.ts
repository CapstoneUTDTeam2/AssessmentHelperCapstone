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
  if (!res.ok) await parseError(res)
  return res.json() as Promise<T>
}

async function parseError(res: Response): Promise<never> {
  const body = await res.json().catch(() => null)
  throw new ApiError(res.status, body?.detail ?? res.statusText)
}

export async function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal, query?: Query): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  const res = await fetch(qs ? `${path}?${qs}` : path, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiPut<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return res.json() as Promise<T>
}
