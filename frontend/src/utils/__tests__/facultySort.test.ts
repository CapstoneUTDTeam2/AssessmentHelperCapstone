import { describe, expect, it } from 'vitest'
import type { FacultyMember, StatusTone } from '../../data/facultyMock'
import { compareFacultyStatus } from '../facultySort'

const member = (name: string, statusTone: StatusTone, nextEvaluationDate: string) =>
  ({ name, statusTone, nextEvaluationDate }) as FacultyMember

describe('compareFacultyStatus', () => {
  it('groups overdue before due even when they share a due semester', () => {
    const rows = [
      member('Aaron', 'due', '2026-01'),
      member('Angelica', 'overdue', '2026-01'),
      member('Bernstein', 'due', '2026-01'),
      member('Brujon', 'overdue', '2026-01'),
    ]
    expect(rows.sort(compareFacultyStatus).map((r) => r.name)).toEqual(['Angelica', 'Brujon', 'Aaron', 'Bernstein'])
  })

  it('puts unknown before up to date, and sorts by due semester within a status', () => {
    const rows = [
      member('A', 'ok', '2027-08'),
      member('B', 'unknown', '9999'),
      member('C', 'due', '2026-08'),
      member('D', 'due', '2026-01'),
    ]
    expect(rows.sort(compareFacultyStatus).map((r) => r.name)).toEqual(['D', 'C', 'B', 'A'])
  })
})
