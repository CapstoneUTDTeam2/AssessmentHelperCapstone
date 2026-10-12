import type { FacultyLevel } from './data/facultyMock'

/** Background color used for a faculty member's avatar and rank badge. */
export const LEVEL_COLORS: Record<FacultyLevel, string> = {
  'Assistant Prof.': 'bg-[#e0791a]',
  'Associate Prof.': 'bg-[#1c4532]',
  'Full Prof.': 'bg-[#13251c]',
  Lecturer: 'bg-neutral-700',
}
