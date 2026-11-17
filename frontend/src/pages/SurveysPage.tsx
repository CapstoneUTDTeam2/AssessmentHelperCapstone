import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { listAppSurveyResponses } from '../api/appSurveys'
import type { AppSurveyResponses } from '../api/appSurveys'
import { getCurrentCycle } from '../api/cycles'
import { listSurveyResponses } from '../api/surveys'
import type { SurveyResponses } from '../api/surveys'
import { downloadCsv } from '../utils/csv'
import { matchesSearch } from '../utils/search'

const card = 'min-w-0 rounded-lg border border-neutral-200 bg-white p-4'

function shortDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function SurveysPage() {
  const [term, setTerm] = useState('')
  const [process, setProcess] = useState<SurveyResponses | null>(null)
  const [app, setApp] = useState<AppSurveyResponses | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const failed: string[] = []
    const soft = <T,>(promise: Promise<T>, what: string) =>
      promise.catch(() => {
        if (!signal.aborted) failed.push(what)
        return null
      })
    Promise.all([
      soft(getCurrentCycle(signal), 'the evaluation cycle'),
      soft(listSurveyResponses(signal), 'post-observation surveys'),
      soft(listAppSurveyResponses(signal), 'app surveys'),
    ]).then(([cycle, processResponses, appResponses]) => {
      if (signal.aborted) return
      if (cycle) setTerm(`${cycle.semester} ${cycle.year}`)
      setProcess(processResponses)
      setApp(appResponses)
      setError(failed.length ? `Couldn’t load ${failed.join(', ')}.` : null)
    })
    return () => controller.abort()
  }, [])

  const processRows = (process?.responses ?? []).filter((r) =>
    matchesSearch(search, [r.professor_name, r.role, r.difficulties ?? '', r.improvements ?? '']),
  )
  const appRows = (app?.responses ?? []).filter((r) =>
    matchesSearch(search, [r.professor_name, r.role, r.course_code, r.improvements ?? '', r.enjoyments ?? '']),
  )
  const okCount = (process?.responses ?? []).filter((r) => r.process_ok).length
  const notOkCount = (process?.responses ?? []).filter((r) => r.process_ok === false).length

  const exportAll = () =>
    downloadCsv(
      `surveys-${term.replace(' ', '-').toLowerCase() || 'current'}.csv`,
      ['Survey', 'Professor', 'Role', 'Process OK', 'Difficulties / What to improve', 'Improvements / What they liked', 'Observation', 'Submitted'],
      [
        ...(process?.responses ?? []).map((r) => [
          'Post-observation',
          r.professor_name,
          r.role,
          r.process_ok == null ? '' : r.process_ok ? 'Yes' : 'No',
          r.difficulties ?? '',
          r.improvements ?? '',
          '',
          r.submitted_at?.slice(0, 10) ?? '',
        ]),
        ...(app?.responses ?? []).map((r) => [
          'App improvement',
          r.professor_name,
          r.role,
          '',
          r.improvements ?? '',
          r.enjoyments ?? '',
          `${r.course_code}.${r.section_name}`,
          r.submitted_on ?? '',
        ]),
      ],
    )

  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Surveys</h1>
          <p className="mt-1 text-xs text-neutral-500">
            {term || 'Current cycle'} · {process?.response_count ?? 0} post-observation responses ·{' '}
            {app?.response_count ?? 0} app survey responses
          </p>
          {error && <p className="mt-1 text-[11px] text-[#b3261e]">{error}</p>}
        </div>
        <button
          type="button"
          onClick={exportAll}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
        >
          Export CSV
        </button>
      </header>

      <label className="mt-5 flex max-w-72 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-400" aria-hidden="true" />
        <span className="sr-only">Search surveys</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search professors or answers"
          className="w-full bg-transparent text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </label>

      <div className="mt-4 space-y-4">
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Post-observation survey</h2>
              <p className="mt-0.5 text-[10px] text-neutral-500">
                About the evaluation process · {process?.committee_notified_at ? `notice sent ${shortDate(process.committee_notified_at)}` : 'notice not sent yet'}
              </p>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="rounded-full bg-[#e3efe6] px-2.5 py-0.5 font-medium text-[#1c4532]">{okCount} said OK</span>
              <span className="rounded-full bg-[#fde8e6] px-2.5 py-0.5 font-medium text-[#b3261e]">{notOkCount} said not OK</span>
            </div>
          </div>
          <ResponseTable
            headers={['Professor', 'Role', 'Process OK', 'Difficulties', 'How to improve', 'Submitted']}
            empty={search ? 'No responses match this search.' : 'No responses yet.'}
            rows={processRows.map((r) => ({
              key: r.survey_response_id,
              cells: [
                <span className="font-medium text-neutral-900">{r.professor_name}</span>,
                r.role,
                r.process_ok == null ? '—' : r.process_ok ? 'Yes' : <span className="text-[#b3261e]">No</span>,
                r.difficulties || '—',
                r.improvements || '—',
                shortDate(r.submitted_at),
              ],
            }))}
          />
          <NotSubmitted names={(process?.not_submitted ?? []).map((p) => `${p.professor_name} (${p.role.toLowerCase()})`)} />
        </section>

        <section className={card}>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">App improvement survey</h2>
            <p className="mt-0.5 text-[10px] text-neutral-500">
              About the app · one per signed observation · due {shortDate(app?.due ?? null)}
            </p>
          </div>
          <ResponseTable
            headers={['Professor', 'Role', 'Observation', 'What to improve', 'What they liked', 'Submitted']}
            empty={search ? 'No responses match this search.' : 'No responses yet.'}
            rows={appRows.map((r) => ({
              key: r.app_response_id,
              cells: [
                <span className="font-medium text-neutral-900">{r.professor_name}</span>,
                r.role,
                `${r.course_code}.${r.section_name} · ${shortDate(r.observation_date)}`,
                r.improvements || '—',
                r.enjoyments || '—',
                shortDate(r.submitted_on),
              ],
            }))}
          />
          <NotSubmitted names={(app?.not_submitted ?? []).map((p) => `${p.professor_name} (${p.role.toLowerCase()}, ${p.course_code}.${p.section_name})`)} />
        </section>
      </div>
    </main>
  )
}

function ResponseTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: { key: number; cells: ReactNode[] }[]
  empty: string
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-[11px]">
        <thead>
          <tr className="bg-neutral-100 text-left text-neutral-600">
            {headers.map((h, i) => (
              <th key={h} className={`px-2 py-1.5 font-normal ${i === 0 ? 'rounded-l' : ''} ${i === headers.length - 1 ? 'rounded-r' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-neutral-100 align-top">
              {row.cells.map((cell, i) => (
                <td key={i} className={`px-2 py-2 text-neutral-700 ${i >= 3 && i <= 4 ? 'max-w-64' : 'whitespace-nowrap'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="py-6 text-center text-neutral-500">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function NotSubmitted({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <p className="mt-3 text-[10px] text-neutral-500">
      <span className="font-medium text-neutral-700">Not submitted ({names.length}):</span> {names.join(', ')}
    </p>
  )
}

export default SurveysPage
