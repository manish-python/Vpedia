import type { AccentKey, ClassId, StreamId, SubjectIconKey } from '@/types'

/* ========================================================================
   Presentation configuration
   ---------------------------------------------------------------------
   The backend owns *data*: names, prices, descriptions, relationships,
   counts, access state. It does not and should not own how a tile looks.

   Everything in this file is decoration, kept in the frontend and keyed by
   a stable identifier (class number, subject name, stream slug). Removing a
   key degrades to a sensible default rather than breaking a page.

   NOTE: this file contains no prices, no class names and no subject lists.
   Those come from the API. The entries below are colours, icons and
   marketing copy only.
   =================================================================== */

export const CLASS_NUMBERS: ClassId[] = [7, 8, 9, 10, 11, 12]

/** Tailwind fragments driving the tile artwork. Rotates with the class. */
const CLASS_ACCENTS: Record<number, AccentKey> = {
  7: 'blue',
  8: 'green',
  9: 'purple',
  10: 'sky',
  11: 'violet',
  12: 'orange',
}

const ACCENT_CYCLE: AccentKey[] = ['blue', 'green', 'purple', 'sky', 'violet', 'orange']

export function classAccent(classNumber: number): AccentKey {
  return CLASS_ACCENTS[classNumber] ?? ACCENT_CYCLE[classNumber % ACCENT_CYCLE.length] ?? 'blue'
}

/** Short line shown on class tiles. */
const CLASS_TAGLINES: Record<number, string> = {
  7: 'Build strong foundations',
  8: 'Understand every concept',
  9: 'Prepare for board level',
  10: 'Ace your board exams',
  11: 'Start your specialisation',
  12: 'Finish strong, score higher',
}

export function classTagline(classNumber: number): string {
  return CLASS_TAGLINES[classNumber] ?? 'Complete study material'
}

/** Icon for a stream tile. */
export function streamIcon(slug: string): SubjectIconKey {
  switch (slug) {
    case 'science':
      return 'microscope'
    case 'commerce':
      return 'coins'
    case 'humanities':
      return 'landmark'
    default:
      return 'compass'
  }
}

/** Bullet list on the class detail page. Identical across classes by design. */
export const CLASS_FEATURES: readonly string[] = [
  'All Subject Notes',
  'Previous Year Questions',
  'Solved PYQs',
  'Important Questions',
  'Practice Papers',
  'Model Papers',
  'Lifetime Access',
]

/** The one class highlighted as "popular" on the classes grid. */
export const POPULAR_CLASS: ClassId = 10

/** Stable slugs the backend seeds. Used to map a stream DTO to `StreamId`. */
export const STREAM_SLUGS: Record<StreamId, string> = {
  science: 'science',
  commerce: 'commerce',
  humanities: 'humanities',
}

/* ---------------------------------------------------------------------
   Subject icons
   ---------------------------------------------------------------------
   Matched on a normalised subject name so "Mathematics" and "Accountancy"
   both resolve, whatever the backend calls the row. Unknown subjects fall
   back to a neutral icon rather than rendering nothing.
   ------------------------------------------------------------------ */

const SUBJECT_ICONS: Array<[RegExp, SubjectIconKey]> = [
  [/mathemat|^maths$/i, 'calculator'],
  [/physics/i, 'brain'],
  [/chemi/i, 'flask'],
  [/biolog|science$/i, 'microscope'],
  [/english/i, 'languages'],
  [/hindi/i, 'languages'],
  [/accountan/i, 'coins'],
  [/business|commerce|economic/i, 'chart'],
  [/histor|politic/i, 'landmark'],
  [/geograph/i, 'globe'],
  [/comput|information|technology/i, 'monitor'],
  [/art|paint/i, 'palette'],
]

const DEFAULT_SUBJECT_ICON: SubjectIconKey = 'book-open'

export function subjectIcon(subjectName: string): SubjectIconKey {
  for (const [pattern, icon] of SUBJECT_ICONS) {
    if (pattern.test(subjectName)) return icon
  }
  return DEFAULT_SUBJECT_ICON
}

/** Accent for a subject tile, rotated so a page of them is not monotone. */
export function subjectAccent(index: number, classNumber: number): AccentKey {
  if (index === 0) return classAccent(classNumber)
  return ACCENT_CYCLE[(classNumber + index) % ACCENT_CYCLE.length] ?? 'blue'
}

/* ---------------------------------------------------------------------
   Copy
   ------------------------------------------------------------------ */

/** Feature bullets are shared, so a class with no API description still reads well. */
export const DEFAULT_CLASS_DESCRIPTION =
  'Get full access to all subjects, chapter-wise notes, PYQs, solutions and practice material.'

export const EMPTY_COPY = {
  subjects: 'No subjects available for this class yet.',
  chapters: 'No chapters available for this subject yet.',
  content: 'No study material has been published for this chapter yet.',
  library: 'You have not purchased any class yet.',
  purchases: 'You have not made any purchase yet.',
  payments: 'You have not submitted any payment proof yet.',
} as const
