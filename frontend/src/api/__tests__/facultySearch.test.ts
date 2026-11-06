import { describe, expect, it } from 'vitest'
import { matchesFacultySearch, toFacultyMember } from '../faculty'

const member = (name: string, currentLevel: string | null, courses: string[]) => ({
  ...toFacultyMember({
    professor_id: 1,
    name,
    current_level: currentLevel,
    start_term_id: null,
    frequency_years: 1,
    last_evaluation_date: null,
    next_due_year: null,
    next_due_semester: null,
    status: 'Unknown',
  }),
  courses,
})

const burr = member('Aaron Burr', 'Assistant Professor', ['CS 1436'])

describe('matchesFacultySearch', () => {
  it('matches the start of any word in the name', () => {
    expect(matchesFacultySearch(burr, 'a')).toBe(true)
    expect(matchesFacultySearch(burr, 'B')).toBe(true)
    expect(matchesFacultySearch(burr, 'aaron b')).toBe(true)
  })

  it('does not match a letter inside a word', () => {
    const smith = member('Robert Smith', 'Full Professor', ['CS 2336'])
    for (const q of ['e', 't', 'u', 's', 'p']) expect(matchesFacultySearch(smith, q), q).toBe(q === 's')
    expect(matchesFacultySearch(burr, 'urr')).toBe(false)
  })

  it('matches courses by subject or number', () => {
    expect(matchesFacultySearch(burr, 'cs 14')).toBe(true)
    expect(matchesFacultySearch(burr, '14')).toBe(true)
    expect(matchesFacultySearch(burr, '36')).toBe(false)
  })

  it('matches level only from the start of its label', () => {
    expect(matchesFacultySearch(burr, 'assist')).toBe(true)
    expect(matchesFacultySearch(burr, 'prof')).toBe(false)
  })

  it('treats a blank search as no filter', () => {
    expect(matchesFacultySearch(burr, '   ')).toBe(true)
  })
})
