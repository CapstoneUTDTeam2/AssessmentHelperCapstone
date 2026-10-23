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

function withQuery(path: string, query?: Query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    // FastAPI errors look like {"detail": ...}; fall back to the status text.
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? res.statusText)
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

export function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  return request<T>(withQuery(path, query), { signal, headers: { Accept: 'application/json' } })
}

function apiSend<T>(method: 'POST' | 'PUT', path: string, body?: unknown, query?: Query, signal?: AbortSignal): Promise<T> {
  return request<T>(withQuery(path, query), {
    method,
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function apiPost<T>(path: string, body?: unknown, query?: Query, signal?: AbortSignal): Promise<T> {
  return apiSend<T>('POST', path, body, query, signal)
}

export function apiPut<T>(path: string, body?: unknown, query?: Query, signal?: AbortSignal): Promise<T> {
  return apiSend<T>('PUT', path, body, query, signal)
}
