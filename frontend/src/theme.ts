import type { KpiAccent } from './data/dashboardMock'
import type { FacultyLevel } from './data/facultyMock'

/** Background color used for a faculty member's avatar and rank badge. */
export const LEVEL_COLORS: Record<FacultyLevel, string> = {
  'Assistant Prof.': 'bg-[#e0791a]',
  'Associate Prof.': 'bg-[#1c4532]',
  'Full Prof.': 'bg-[#13251c]',
  Lecturer: 'bg-neutral-700',
}

/** Accent stripe color on KPI cards (Dashboard and Evaluations pages). */
export const KPI_ACCENTS: Record<KpiAccent, string> = {
  green: 'bg-[#1c4532]',
  red: 'bg-[#b3261e]',
  black: 'bg-neutral-900',
  orange: 'bg-[#e0791a]',
}
