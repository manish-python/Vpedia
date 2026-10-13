import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  BookOpen,
  Brain,
  Calculator,
  ChartNoAxesColumn,
  Compass,
  Coins,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Microscope,
  Monitor,
  Palette,
  PenTool,
  Scale,
} from 'lucide-react'

import type { SubjectIconKey } from '@/types'

/* ========================================================================
   Subject icon registry
   Maps a data key to a Lucide outline icon. Adding a subject never means
   touching a component.
   =================================================================== */
export const SUBJECT_ICONS: Record<SubjectIconKey, LucideIcon> = {
  calculator: Calculator,
  flask: FlaskConical,
  'book-open': BookOpen,
  globe: Globe2,
  languages: Languages,
  monitor: Monitor,
  landmark: Landmark,
  chart: ChartNoAxesColumn,
  microscope: Microscope,
  scale: Scale,
  compass: Compass,
  palette: Palette,
  coins: Coins,
  'landmark-bank': Banknote,
  brain: Brain,
  'pen-tool': PenTool,
}

export function getSubjectIcon(key: SubjectIconKey | undefined): LucideIcon {
  return SUBJECT_ICONS[key ?? 'book-open'] ?? BookOpen
}
