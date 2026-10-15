import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { monthsBetween, toIso } from '../utils/calendar'

interface MonthCalendarProps {
  /** ISO dates; every month the range touches is shown. */
  from: string
  to: string
  /** Contents of a day cell, or null to show the date as not selectable. */
  renderDay: (date: Date, iso: string) => ReactNode | null
}

/** Side-by-side month grids for picking or toggling days. */
function MonthCalendar({ from, to, renderDay }: MonthCalendarProps) {
  const months = useMemo(() => monthsBetween(from, to), [from, to])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {months.map((month) => (
        <div key={month.label}>
          <p className="mb-1.5 text-xs font-medium">{month.label}</p>
          <table className="w-full table-fixed text-center text-[11px]">
            <thead>
              <tr className="text-neutral-400">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <th key={i} className="pb-1 font-normal">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.weeks.map((week, w) => (
                <tr key={w}>
                  {week.map((date, i) => (
                    <td key={i} className="p-0.5">
                      {date &&
                        (renderDay(date, toIso(date)) ?? (
                          <span className="block py-1 text-neutral-300">{date.getUTCDate()}</span>
                        ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default MonthCalendar
