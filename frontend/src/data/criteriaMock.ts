// Placeholder data for the Evaluation Criteria page. Swap these for API
// responses once the criteria endpoints are wired up.

export type Modality = 'All' | 'In person' | 'Online / Hybrid'

export interface CriteriaSection {
  id: string
  name: string
}

export interface Criterion {
  /** Stable identifier. The number shown on the form is the criterion's position in the list. */
  id: number
  sectionId: string
  text: string
  /** Sub-points listed under the criterion on the observation form. */
  points: string[]
  guidance: string
  appliesTo: Modality
  /** Number of submitted reports that used this criterion. */
  usedIn: number
  active: boolean
  required: boolean
  /** Ask the observer for a growth note when rated 1 or 2. */
  notesOnLowRating: boolean
}

export const CURRENT_CYCLE = 'Fall 2026'

export const RATING_SCALE: { label: string; tone: 'green' | 'orange' | 'neutral' }[] = [
  { label: '5 · Exemplary', tone: 'green' },
  { label: '4 · Exceeds', tone: 'green' },
  { label: '3 · Meets', tone: 'green' },
  { label: '2 · Developing', tone: 'orange' },
  { label: '1 · Needs improvement', tone: 'orange' },
  { label: 'N/A', tone: 'neutral' },
]

export const SECTIONS: CriteriaSection[] = [
  { id: 'setup', name: 'Course Setup & Structure' },
  { id: 'engagement', name: 'Engagement & Communication' },
  { id: 'instruction', name: 'Instruction & Delivery' },
  { id: 'assessment', name: 'Assessment & Student Success' },
]

function criterion(
  id: number,
  sectionId: string,
  text: string,
  appliesTo: Modality,
  usedIn: number,
  guidance = '',
  points: string[] = [],
): Criterion {
  return { id, sectionId, text, points, guidance, appliesTo, usedIn, active: true, required: true, notesOnLowRating: true }
}

export const CRITERIA: Criterion[] = [
  criterion(1, 'setup', 'Canvas course shell prepared according to college guidelines testing', 'Online / Hybrid', 36, '', [
    'Clear expectations about communication, interaction, and participation',
  ]),
  criterion(2, 'setup', 'Intentional and organized lecture for the day', 'Online / Hybrid', 36),
  criterion(3, 'setup', 'Course welcome and introductions', 'All', 41),
  criterion(4, 'setup', 'Contact information and methods of contact', 'All', 41),
  criterion(5, 'engagement', 'Regular and active engagement with students', 'All', 41),
  criterion(6, 'engagement', 'Opportunities for interaction and collaboration throughout the observed lecture', 'All', 41),
  criterion(
    7,
    'instruction',
    'Clarity of teaching instruction',
    'All',
    41,
    'May include: explaining concepts clearly, using examples, checking for understanding, connecting to prior learning.',
  ),
  criterion(8, 'instruction', 'Pace of teaching', 'All', 41),
  criterion(9, 'instruction', "Quality of instructor's handling of student questions", 'In person', 22),
  criterion(10, 'instruction', 'Knowledge and preparedness of course content', 'All', 41),
  criterion(11, 'assessment', 'Material alignment with the lecture', 'All', 39),
]
