import { useEffect, useState } from 'react'
import { getDueMatches } from '../api/signups'
import type { DueMatch } from '../api/signups'
import { MockDataBadge } from './MockData'

function classLabel(row: DueMatch) {
  if (!row.course_code) return row.reason ?? 'No class this term'
  const when = [row.meeting_days, row.start_time && row.end_time ? `${row.start_time}–${row.end_time}` : null]
    .filter(Boolean)
    .join(' ')
  return `${row.course_code}${when ? ` · ${when}` : ''}`
}

function DueMatchesCard() {
  const [rows, setRows] = useState<DueMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [term, setTerm] = useState('—')

  useEffect(() => {
    const controller = new AbortController()
    getDueMatches(controller.signal)
      .then((body) => {
        setRows(body.faculty.filter((row) => row.evaluation_status === 'Due'))
        setTerm(`${body.semester} ${body.year}`)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Could not load potential observers')
        }
      })
    return () => controller.abort()
  }, [])

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-neutral-900">
        Potential observers for due faculty
        <MockDataBadge />
      </h2>
      <p className="mt-0.5 text-[10px] text-neutral-500">
        Tester AC preview · {term} · if every Due professor signed up · up to 5 observers each
        (same department, same course level, free at class time).
      </p>
      {error && <p className="mt-2 text-[11px] text-[#b3261e]">{error}</p>}
      {rows === null && !error && <p className="mt-3 text-[11px] text-neutral-500">Loading matches…</p>}
      {rows && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {rows.map((row) => (
            <li key={row.faculty_id} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold text-neutral-900">
                  {row.faculty_name}
                  <span className="ml-1.5 font-normal text-neutral-500">
                    {row.evaluation_status}
                    {row.signed_up ? ' · signed up' : ''}
                  </span>
                </p>
                <p className={`text-[10px] ${row.insufficient ? 'text-[#b3261e]' : 'text-neutral-500'}`}>
                  {row.insufficient
                    ? 'No / insufficient observers'
                    : `${row.eligible_count} eligible`}
                </p>
              </div>
              <p className="text-[10px] text-neutral-500">{classLabel(row)}</p>
              <p className="mt-1 text-[11px] text-neutral-800">
                {row.observers.map((observer) => observer.name).join(', ') || 'None'}
              </p>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-4 text-center text-[11px] text-neutral-500">
              No due faculty this cycle.
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

export default DueMatchesCard
