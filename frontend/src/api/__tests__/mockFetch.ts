// Replaces global fetch with a mock that answers every call with one JSON response.

import { vi } from 'vitest'

export function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The URL and init of the nth fetch call. */
export function fetchCall(fetchMock: ReturnType<typeof mockFetch>, n = 0) {
  const [url, init] = fetchMock.mock.calls[n] as unknown as [string, RequestInit]
  return { url, init }
}
