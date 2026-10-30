// Date helpers for the sign-up pop-ups. Dates are handled as UTC midnight so
// ISO strings never shift a day.

export const toIso = (d: Date) => d.toISOString().slice(0, 10)
export const fromIso = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** True when a section meeting on `days` ("MW", "TR", or "Tuesday,Thursday") meets on this date. */
export const meetsOn = (days: string, d: Date) =>
  weekdaysFromMeetingDays(days).includes(WEEKDAY_LABELS[d.getUTCDay()] as WeekdayLabel)

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

const WEEKDAY_FROM_TOKEN: Record<string, 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'> = {
  M: 'Mon',
  T: 'Tue',
  W: 'Wed',
  R: 'Thu',
  F: 'Fri',
  MON: 'Mon',
  TUE: 'Tue',
  TUES: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  THUR: 'Thu',
  THURS: 'Thu',
  FRI: 'Fri',
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
}

type WeekdayLabel = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'
const WEEK_ORDER: WeekdayLabel[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const LETTER_OF: Record<WeekdayLabel, string> = { Mon: 'M', Tue: 'T', Wed: 'W', Thu: 'R', Fri: 'F' }

/** "MW", "TR", "MWF", or CourseBook "Tuesday,Thursday" → weekday labels in week order. */
export function weekdaysFromMeetingDays(days: string | null | undefined) {
  const seen = new Set<WeekdayLabel>()
  for (const token of (days ?? '').split(/[^A-Za-z]+/).filter(Boolean)) {
    const word = WEEKDAY_FROM_TOKEN[token.toUpperCase()]
    if (word) {
      seen.add(word)
    } else if (/^[MTWRF]+$/i.test(token)) {
      // Letter codes like "MW" or "TR": one letter per day.
      for (const letter of token.toUpperCase()) seen.add(WEEKDAY_FROM_TOKEN[letter])
    }
  }
  return WEEK_ORDER.filter((day) => seen.has(day))
}

/** Any meeting-day format → letter code like "MW" or "TR" ("" if unknown). */
export function meetingDayLetters(days: string | null | undefined) {
  return weekdaysFromMeetingDays(days).map((day) => LETTER_OF[day]).join('')
}

/** Any meeting-day format → "Mon/Wed". Falls back to the original text if it can't be read. */
export function formatMeetingDays(days: string | null | undefined) {
  const labels = weekdaysFromMeetingDays(days)
  return labels.length ? labels.join('/') : (days ?? '')
}

/**
 * Side-by-side layout for blocks that overlap in time on the same day.
 * Each item gets a lane (0-based) and how many lanes its overlapping group needs,
 * so it can be drawn at width 1/lanes and shifted by lane/lanes.
 */
export function layoutOverlaps<T extends { start: string; end: string }>(items: T[]) {
  const toMin = (value: string) => {
    const [h, m] = value.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const sorted = items
    .map((item, index) => ({ item, index, start: toMin(item.start), end: toMin(item.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
  const placed: { item: T; index: number; lane: number; lanes: number }[] = []
  let group: typeof placed = []
  let laneEnds: number[] = []
  let groupEnd = -1
  const closeGroup = () => {
    for (const entry of group) entry.lanes = laneEnds.length
    group = []
    laneEnds = []
  }
  for (const entry of sorted) {
    if (entry.start >= groupEnd) {
      closeGroup()
      groupEnd = -1
    }
    let lane = laneEnds.findIndex((end) => end <= entry.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(entry.end)
    } else {
      laneEnds[lane] = entry.end
    }
    const out = { item: entry.item, index: entry.index, lane, lanes: 1 }
    group.push(out)
    placed.push(out)
    groupEnd = Math.max(groupEnd, entry.end)
  }
  closeGroup()
  return placed.sort((a, b) => a.index - b.index)
}

export function formatLongDate(iso: string) {
  return fromIso(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
}
