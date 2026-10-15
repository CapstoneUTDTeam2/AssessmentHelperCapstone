// Default values for the Settings pages. Swap these for API responses once
// the settings endpoints exist. Defaults follow the evaluation process in
// docs/SRS.md and docs/Q_A.docx.

import type { Channels } from '../components/settings'

export const CYCLE_FREQUENCIES = ['Every semester (Fall & Spring)', 'Every year', 'Every 2 years', 'Every 3 years'] as const
export type CycleFrequency = (typeof CYCLE_FREQUENCIES)[number]

export const LEVEL_RULES = ['Same level', 'Same or higher', 'Strictly higher'] as const
export const LEVEL_ASSIGNMENTS = ['Highest course taught', 'Most sections taught', 'Manual'] as const
export const INSTRUCTOR_LEVELS = ['1000s', '2000s', '3000s', '4000s', '5000s', '6000s']
export const UNMATCHED_AFTER = ['Immediately', '3 days', '7 days', '14 days'] as const
export const EVALUATION_CYCLES = ['Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027'] as const
export const UPCOMING_WINDOWS = [7, 14, 30] as const
export const FACULTY_FILTERS = ['Due this cycle', 'Overdue', 'Unmatched', 'Needs observer', 'All faculty'] as const
export const FACULTY_SORTS = ['Next evaluation', 'Name', 'Level', 'Status'] as const
export const ROWS_PER_PAGE = [12, 25, 50] as const
export const DIGEST_TIMES = ['Off', 'Monday, 8:00 AM', 'Monday, 12:00 PM', 'Friday, 8:00 AM', 'Friday, 3:00 PM'] as const
export const DEADLINE_NOTICES = ['On the day it opens', '3 days before', '7 days before', '14 days before'] as const
export const FACULTY_FIELDS = ['Hire date', 'Program start date', 'Rank', 'Instructor level', 'Tenure status', 'Email'] as const

const both: Channels = { email: true, inApp: true }

export const AC_SETTINGS = {
  // Evaluation Policy
  assistantCycle: 'Every semester (Fall & Spring)' as CycleFrequency,
  associateCycle: 'Every 2 years' as CycleFrequency,
  fullCycle: 'Every 2 years' as CycleFrequency,
  lecturerCycle: 'Every 2 years' as CycleFrequency,
  minSignups: 1,
  skipFirstSemester: true,
  levelRule: 'Same level' as (typeof LEVEL_RULES)[number],
  topLevelPeers: true,
  eligibilityBasis: 'Hire date' as 'Hire date' | 'Program start',
  levelsInScope: ['1000s', '2000s', '3000s', '4000s'],

  // Observer Matching Rules
  minRecommendations: 3,
  maxRecommendations: 5,
  levelAssignment: 'Highest course taught' as (typeof LEVEL_ASSIGNMENTS)[number],
  balanceLoad: true,
  unmatchedAfter: 'Immediately' as (typeof UNMATCHED_AFTER)[number],
  crossDepartment: false,

  // Cycle & Deadlines
  currentCycle: 'Fall 2026' as (typeof EVALUATION_CYCLES)[number],
  signupDeadline: '2026-09-15',
  observationDeadline: '2026-11-20',

  // Dashboard & Lists
  upcomingWindow: 14 as (typeof UPCOMING_WINDOWS)[number],
  facultyFilter: 'Due this cycle' as (typeof FACULTY_FILTERS)[number],
  facultySort: 'Next evaluation' as (typeof FACULTY_SORTS)[number],
  rowsPerPage: 12 as (typeof ROWS_PER_PAGE)[number],

  // Data Sources
  keepCourseCorrections: true,

  // Notifications
  notifySignup: { email: false, inApp: true } as Channels,
  notifyReportSigned: { email: false, inApp: true } as Channels,
  notifyPullFailure: both,
  deadlineNotice: '7 days before' as (typeof DEADLINE_NOTICES)[number],
  weeklyDigest: 'Monday, 8:00 AM' as (typeof DIGEST_TIMES)[number],
}

export type AcSettings = typeof AC_SETTINGS

/** Faculty counts per rank, shown under each evaluation cycle setting. */
export const RANK_COUNTS = { assistant: 18, associate: 11, full: 7, lecturer: 6 }

export const LAST_COURSEBOOK_PULL = '2026-08-18'

export const TEACHER_SETTINGS = {
  scheduleView: 'Week' as 'Day' | 'Week' | 'Month',
  weekStart: 'Mon' as 'Sun' | 'Mon',
  dayStart: '8:00 AM',
  dayEnd: '5:00 PM',
  timeZone: 'America/Chicago (CT)',
  showOfficeHours: true,
  showObserving: true,
  notifyObserverRequest: both,
  notifyAwaitingConfirmation: both,
  notifyConfirmed: { email: false, inApp: true } as Channels,
  deadlineReminder: '7 days before' as (typeof DEADLINE_NOTICES)[number],
  notifyDeadline: both,
  notifyOverdue: both,
  weeklyDigest: 'Monday, 8:00 AM' as (typeof DIGEST_TIMES)[number],
}

export type TeacherSettings = typeof TEACHER_SETTINGS

export const HOURS = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '12:00 PM', '3:00 PM', '5:00 PM', '7:00 PM', '9:00 PM', '10:00 PM']
export const TIME_ZONES = ['America/Chicago (CT)', 'America/New_York (ET)', 'America/Denver (MT)', 'America/Los_Angeles (PT)']
