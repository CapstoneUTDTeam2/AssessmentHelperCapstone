import { useMemo, useState } from 'react'

export type Sort<K extends string> = { key: K; dir: 'asc' | 'desc' }
export type Comparators<T, K extends string> = Record<K, (a: T, b: T) => number>

/** Sorts rows by the active column; toggling the same column again flips direction. */
export function useSortedRows<T, K extends string>(rows: T[], comparators: Comparators<T, K>, initial: NoInfer<Sort<K>>) {
  const [sort, setSort] = useState(initial)
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * comparators[sort.key](a, b)),
    [rows, comparators, sort],
  )
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  return { sorted, sort, toggle }
}
