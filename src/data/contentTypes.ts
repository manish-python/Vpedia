import {
  BookOpen,
  FileText,
  GraduationCap,
  HelpCircle,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react'

import type { ContentType } from '@/types'

/* ========================================================================
   Content type system — one definition drives icons, labels, tints and
   tab ordering across the entire product. No duplicated per-type components.
   ===================================================================== */
export interface ContentTypeMeta {
  id: ContentType
  /** Short label for tabs, chips and pills. */
  label: string
  /** Singular label for card subtitles, e.g. "PYQ · 12 pages". */
  singular: string
  description: string
  icon: LucideIcon
  /** Tailwind fragments: icon tile background + text colour. */
  tile: string
  text: string
}

export const CONTENT_TYPES: Record<ContentType, ContentTypeMeta> = {
  NOTES: {
    id: 'NOTES',
    label: 'Notes',
    singular: 'Notes',
    description: 'Complete chapter-wise notes prepared for quick revision.',
    icon: BookOpen,
    tile: 'bg-brand-50 text-brand-600',
    text: 'text-brand-700',
  },
  PYQ: {
    id: 'PYQ',
    label: 'PYQs',
    singular: 'PYQ',
    description: 'Previous year question papers, exactly as asked in the board exam.',
    icon: FileText,
    tile: 'bg-grape-50 text-grape-600',
    text: 'text-grape-700',
  },
  SOLVED_PYQ: {
    id: 'SOLVED_PYQ',
    label: 'Solved PYQs',
    singular: 'Solved PYQ',
    description: 'Step-by-step solutions with the correct option and marking scheme.',
    icon: GraduationCap,
    tile: 'bg-leaf-50 text-leaf-600',
    text: 'text-leaf-700',
  },
  IMPORTANT_QUESTIONS: {
    id: 'IMPORTANT_QUESTIONS',
    label: 'Important Qs',
    singular: 'Important Questions',
    description: 'High-weightage questions most likely to appear this year.',
    icon: Target,
    tile: 'bg-sun-50 text-sun-600',
    text: 'text-sun-700',
  },
  PRACTICE_PAPER: {
    id: 'PRACTICE_PAPER',
    label: 'Practice Papers',
    singular: 'Practice Paper',
    description: 'Full-length practice papers for timed revision.',
    icon: Sparkles,
    tile: 'bg-rose-50 text-rose-600',
    text: 'text-rose-600',
  },
  MODEL_PAPER: {
    id: 'MODEL_PAPER',
    label: 'Model Papers',
    singular: 'Model Paper',
    description: 'Sample papers that closely mirror the official board pattern.',
    icon: HelpCircle,
    tile: 'bg-sky-brand-50 text-sky-brand-600',
    text: 'text-sky-brand-600',
  },
}

/** Tab order on the chapter content page. */
export const CONTENT_TYPE_ORDER: ContentType[] = [
  'NOTES',
  'PYQ',
  'SOLVED_PYQ',
  'IMPORTANT_QUESTIONS',
  'PRACTICE_PAPER',
  'MODEL_PAPER',
]

export function getContentTypeMeta(type: ContentType): ContentTypeMeta {
  return CONTENT_TYPES[type]
}

/* ---------------------------------------------------------------------
   Library tab → the content types that belong to each tab.
   ------------------------------------------------------------------ */
export const LIBRARY_TAB_TYPES: Record<string, ContentType[]> = {
  notes: ['NOTES', 'SOLVED_PYQ', 'IMPORTANT_QUESTIONS'],
  pyqs: ['PYQ', 'SOLVED_PYQ'],
  practice: ['PRACTICE_PAPER', 'MODEL_PAPER'],
}
