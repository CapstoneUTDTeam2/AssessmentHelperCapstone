import { describe, expect, it } from 'vitest'
import { courseLevel, isGraduateCode } from '../courses'

describe('course level', () => {
  it('uses the first digit of the course number', () => {
    expect(courseLevel('CS 1337')).toBe(1000)
    expect(courseLevel('CS 6301')).toBe(6000)
  })

  it('reads variable-credit codes with letters', () => {
    expect(courseLevel('CS 8V02')).toBe(8000)
    expect(courseLevel('CS 2V95')).toBe(2000)
    expect(isGraduateCode('CS 8V99')).toBe(true)
    expect(isGraduateCode('CS 2V95')).toBe(false)
  })

  it('treats 5000-level and up as graduate', () => {
    expect(isGraduateCode('CS 4485')).toBe(false)
    expect(isGraduateCode('CS 5303')).toBe(true)
  })

  it('handles codes with no number', () => {
    expect(courseLevel('CS')).toBeNull()
    expect(isGraduateCode('CS')).toBe(false)
  })
})
