import type { LucideIcon } from 'lucide-react'
import {
  BookOpenCheck,
  ClipboardCheck,
  FileStack,
  GraduationCap,
  Layers,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'

/* ========================================================================
   Landing page content — kept out of the page component so the page
   stays purely presentational.
   ===================================================================== */

export type FeatureAccent = 'purple' | 'green' | 'orange' | 'pink' | 'sky' | 'violet'

export interface LandingFeature {
  icon: LucideIcon
  title: string
  description: string
  accent: FeatureAccent
}

/** Five-card strip directly beneath the hero, matching the reference. */
export const HERO_FEATURES: LandingFeature[] = [
  {
    icon: Layers,
    title: 'Complete Study Material',
    description: 'Everything for the full syllabus in one place.',
    accent: 'purple',
  },
  {
    icon: BookOpenCheck,
    title: 'Chapter-wise Notes',
    description: 'Clean notes, one chapter at a time.',
    accent: 'orange',
  },
  {
    icon: FileStack,
    title: 'Previous Year Questions',
    description: 'Real board papers from past years.',
    accent: 'pink',
  },
  {
    icon: GraduationCap,
    title: 'Solved Solutions',
    description: 'Step-by-step answers with marking scheme.',
    accent: 'sky',
  },
  {
    icon: Sparkles,
    title: 'Practice & Model Papers',
    description: 'Timed practice that mirrors the exam.',
    accent: 'violet',
  },
]

/** Deeper "Everything You Need to Learn Better" section. */
export const DEEP_FEATURES: LandingFeature[] = [
  {
    icon: Layers,
    title: 'Complete Study Material',
    description:
      'Notes, questions, solutions and papers for every chapter of every subject — nothing missing.',
    accent: 'purple',
  },
  {
    icon: BookOpenCheck,
    title: 'Chapter-wise Notes',
    description:
      'Each chapter broken into clear, readable notes so revision takes minutes, not hours.',
    accent: 'sky',
  },
  {
    icon: FileStack,
    title: 'Previous Year Questions',
    description:
      'The actual papers from previous board years, so you know exactly how questions are framed.',
    accent: 'orange',
  },
  {
    icon: GraduationCap,
    title: 'Solved Solutions',
    description:
      'Every important question solved step by step with the reasoning behind the answer.',
    accent: 'green',
  },
  {
    icon: ClipboardCheck,
    title: 'Practice & Model Papers',
    description:
      'Full-length papers to test yourself under real exam timing before the actual exam day.',
    accent: 'pink',
  },
  {
    icon: Target,
    title: 'Important Questions',
    description:
      'A focused list of high-weightage questions, compiled chapter by chapter.',
    accent: 'violet',
  },
]

export interface TrustItem {
  icon: LucideIcon
  title: string
  description: string
  accent: FeatureAccent
}

export const TRUST_ITEMS: TrustItem[] = [
  {
    icon: BookOpenCheck,
    title: 'Quality Content',
    description: 'Chapter-wise and exam focused',
    accent: 'green',
  },
  {
    icon: Zap,
    title: 'Easy Access',
    description: 'Study anywhere, anytime',
    accent: 'sky',
  },
  {
    icon: TrendingUp,
    title: 'Better Results',
    description: 'Learn smart, score better',
    accent: 'orange',
  },
]

/** Floating chips that orbit the hero illustration. */
export const HERO_CHIPS = ['Notes', 'PYQs', 'Solutions', 'Practice Papers'] as const

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Classes', href: '/classes' },
  { label: 'Features', href: '/#features' },
  // Anchors the price grid on the class selection page rather than
  // duplicating the Classes link.
  { label: 'Pricing', href: '/classes#pricing' },
  { label: 'FAQs', href: '/faq' },
] as const
