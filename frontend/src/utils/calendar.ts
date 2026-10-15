// Date helpers for the sign-up pop-ups. Dates are handled as UTC midnight so
// ISO strings never shift a day.

export const toIso = (d: Date) => d.toISOString().slice(0, 10)
export const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

/** CourseBook meeting-day letters, indexed by getUTCDay(). */
const DAY_LETTERS = ['U', 'M', 'T', 'W', 'R', 'F', 'S']

/** True when a section meeting on `days` (e.g. "MW", "TR") meets on this date. */
export const meetsOn = (days: string, d: Date) => days.includes(DAY_LETTERS[d.getUTCDay()])

export function businessDays(from: string, to: string) {
  const days: string[] = []
  for (let d = fromIso(from); d <= fromIso(to); d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isWeekend(d)) days.push(toIso(d))
  }
  return days
}

/** Calendar weeks (Sun–Sat) for each month the range touches. */
export function monthsBetween(from: string, to: string) {
  const months: { label: string; weeks: (Date | null)[][] }[] = []
  const start = fromIso(from)
  const end = fromIso(to)
  for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); m <= end; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const year = m.getUTCFullYear()
    const month = m.getUTCMonth()
    const cells: (Date | null)[] = Array(new Date(Date.UTC(year, month, 1)).getUTCDay()).fill(null)
    const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    for (let day = 1; day <= length; day++) cells.push(new Date(Date.UTC(year, month, day)))
    while (cells.length % 7) cells.push(null)
    const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
    months.push({ label: m.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), weeks })
  }
  return months
}

/** "13:00" → "1:00 PM" */
export function formatTime(value: string) {
  const [h, m] = value.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function formatLongDate(iso: string) {
  return fromIso(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
