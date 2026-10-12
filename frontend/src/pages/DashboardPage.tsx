import EvaluationsCard from '../components/EvaluationsTable'
import { HIRE_LEVEL_COUNTS, KPIS } from '../data/dashboardMock'
import type { HireLevel } from '../data/dashboardMock'
import { KPI_ACCENTS } from '../theme'

const HIRE_LEVEL_DOTS: Record<HireLevel, string> = {
  Assistant: 'bg-[#e0791a]',
  Associate: 'bg-[#c4561a]',
  Full: 'bg-[#1c4532]',
  Lecturer: 'bg-neutral-900',
}

function DashboardPage() {
  return (
    <main className="min-w-0 flex-1 px-6 py-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Evaluation Committee Dashboard</h1>
          <p className="mt-1 text-xs text-neutral-500">Fall 2026 evaluation cycle · Last synced 2 min ago</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 transition-colors hover:bg-neutral-50"
          >
            Export Report
          </button>
          <button
            type="button"
            className="rounded-md bg-[#e0791a] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#c96a12]"
          >
            + Run Observer Selection
          </button>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[264px_1fr]">
        <div className="flex flex-col gap-2.5">
          {KPIS.map((kpi) => (
            <section
              key={kpi.label}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-4"
            >
              <span className={`h-6 w-0.5 shrink-0 rounded ${KPI_ACCENTS[kpi.accent]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[11px] text-neutral-600">{kpi.label}</h2>
                <p className={`text-[10px] ${kpi.detailPositive ? 'text-[#3f8a55]' : 'text-neutral-500'}`}>
                  {kpi.detail}
                </p>
              </div>
              <p className="text-xl font-semibold text-[#1c4532]">{kpi.value}</p>
            </section>
          ))}

          <HireLevelCard />
        </div>

        <EvaluationsCard />
      </div>
    </main>
  )
}

function HireLevelCard() {
  const total = HIRE_LEVEL_COUNTS.reduce((sum, row) => sum + row.count, 0)

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Faculty Due by Hire Level</h2>
      <p className="text-[10px] text-neutral-500">Evaluation eligibility this cycle</p>

      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="bg-neutral-100 text-[10px] text-neutral-600">
            <th className="rounded-l px-2 py-1.5 text-left font-normal">Hire level</th>
            <th className="px-2 py-1.5 text-right font-normal">Faculty due</th>
            <th className="rounded-r px-2 py-1.5 text-right font-normal">Share</th>
          </tr>
        </thead>
        <tbody>
          {HIRE_LEVEL_COUNTS.map(({ level, count }) => (
            <tr key={level} className="border-b border-neutral-100">
              <td className="px-2 py-2 text-neutral-900">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${HIRE_LEVEL_DOTS[level]}`} aria-hidden="true" />
                  {level}
                </span>
              </td>
              <td className="px-2 py-2 text-right text-neutral-900">{count}</td>
              <td className="px-2 py-2 text-right text-neutral-500">{Math.round((count / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-neutral-900">
            <td className="px-2 pt-2.5">Total</td>
            <td className="px-2 pt-2.5 text-right">{total}</td>
            <td className="px-2 pt-2.5 text-right font-normal text-neutral-500">100%</td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

export default DashboardPage
