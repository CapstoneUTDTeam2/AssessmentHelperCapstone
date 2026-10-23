// Points the relative "/api/..." paths at a running backend (docker compose up).
// Set API_BASE_URL to use one other than localhost:8000.

import { vi } from 'vitest'

export const API_BASE_URL = (import.meta.env.API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

async function backendIsUp() {
  try {
    return (await fetch(`${API_BASE_URL}/health/db`, { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

/** False when the backend isn't reachable, so the suite can be skipped. */
export const backendAvailable = await backendIsUp()

export function useLiveBackend() {
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => realFetch(`${API_BASE_URL}${path}`, init))
}

type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array'
/** A trailing "?" means the field may also be null. */
export type Shape = Record<string, FieldType | `${FieldType}?`>

function typeOf(value: unknown): FieldType | 'null' | 'undefined' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value as FieldType | 'undefined'
}

/** Fails on missing, extra or wrongly-typed fields, so backend renames show up. */
export function shapeErrors(value: unknown, shape: Shape): string[] {
  if (typeOf(value) !== 'object') return [`expected an object, got ${typeOf(value)}`]
  const record = value as Record<string, unknown>
  const errors: string[] = []
  for (const [key, expected] of Object.entries(shape)) {
    const nullable = expected.endsWith('?')
    const type = expected.replace('?', '')
    const actual = typeOf(record[key])
    if (actual !== type && !(nullable && actual === 'null')) errors.push(`${key}: expected ${expected}, got ${actual}`)
  }
  for (const key of Object.keys(record)) {
    if (!(key in shape)) errors.push(`${key}: not in the frontend type`)
  }
  return errors
}
