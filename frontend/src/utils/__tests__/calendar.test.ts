import { describe, expect, it } from 'vitest'
import { formatMeetingDays, layoutOverlaps, meetingDayLetters, meetsOn, weekdaysFromMeetingDays } from '../calendar'

describe('meeting days', () => {
  it('reads letter codes from the sample data', () => {
    expect(weekdaysFromMeetingDays('MW')).toEqual(['Mon', 'Wed'])
    expect(weekdaysFromMeetingDays('TR')).toEqual(['Tue', 'Thu'])
    expect(weekdaysFromMeetingDays('MWF')).toEqual(['Mon', 'Wed', 'Fri'])
    expect(weekdaysFromMeetingDays('R')).toEqual(['Thu'])
  })

  it('reads full day names from CourseBook', () => {
    expect(weekdaysFromMeetingDays('Monday,Wednesday')).toEqual(['Mon', 'Wed'])
    expect(weekdaysFromMeetingDays('Tuesday,Thursday')).toEqual(['Tue', 'Thu'])
    expect(weekdaysFromMeetingDays('Friday')).toEqual(['Fri'])
    expect(weekdaysFromMeetingDays('Tue, Thu')).toEqual(['Tue', 'Thu'])
  })

  it('handles empty values', () => {
    expect(weekdaysFromMeetingDays('')).toEqual([])
    expect(weekdaysFromMeetingDays(null)).toEqual([])
  })

  it('formats for display instead of splitting letter by letter', () => {
    expect(formatMeetingDays('Monday,Wednesday')).toBe('Mon/Wed')
    expect(formatMeetingDays('TR')).toBe('Tue/Thu')
    expect(formatMeetingDays('Online')).toBe('Online')
  })

  it('converts to letter codes', () => {
    expect(meetingDayLetters('Tuesday,Thursday')).toBe('TR')
    expect(meetingDayLetters('MWF')).toBe('MWF')
  })

  it('matches calendar dates for both formats', () => {
    const monday = new Date(Date.UTC(2026, 10, 2))
    const thursday = new Date(Date.UTC(2026, 10, 5))
    expect(meetsOn('MW', monday)).toBe(true)
    expect(meetsOn('Monday,Wednesday', monday)).toBe(true)
    expect(meetsOn('TR', thursday)).toBe(true)
    expect(meetsOn('Tuesday,Thursday', thursday)).toBe(true)
    expect(meetsOn('MW', thursday)).toBe(false)
  })
})

describe('layoutOverlaps', () => {
  const lanes = (items: { start: string; end: string }[]) => layoutOverlaps(items).map(({ lane, lanes }) => [lane, lanes])

  it('gives a single block the full width', () => {
    expect(lanes([{ start: '09:00', end: '10:15' }])).toEqual([[0, 1]])
  })

  it('puts two classes at the same time side by side', () => {
    expect(lanes([{ start: '13:00', end: '14:15' }, { start: '13:00', end: '14:15' }])).toEqual([[0, 2], [1, 2]])
  })

  it('splits partly overlapping blocks', () => {
    expect(lanes([{ start: '09:00', end: '10:15' }, { start: '10:00', end: '11:15' }])).toEqual([[0, 2], [1, 2]])
  })

  it('keeps back to back and separate blocks full width', () => {
    expect(lanes([{ start: '09:00', end: '10:00' }, { start: '10:00', end: '11:00' }, { start: '14:00', end: '15:00' }])).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
    ])
  })

  it('reuses a free lane and keeps the original order', () => {
    const result = lanes([
      { start: '09:00', end: '12:00' },
      { start: '09:30', end: '10:00' },
      { start: '10:30', end: '11:00' },
    ])
    expect(result).toEqual([[0, 2], [1, 2], [1, 2]])
  })
})
