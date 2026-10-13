import type { AccentKey } from '@/types'

/* ========================================================================
   Accent registry
   Every coloured surface in the product reads its palette from here so a
   new accent is a one-line change instead of a component rewrite.
   =================================================================== */

export interface AccentPalette {
  /** Icon tile background. */
  tile: string
  /** Text/icon colour on top of that tile. */
  text: string
  /** Solid fill for small badges and dots. */
  solid: string
  /** Border for outlined pills. */
  border: string
  /** Very light wash for card backgrounds. */
  wash: string
  /** Ring colour for hover/focus emphasis. */
  ring: string
}

export const ACCENTS: Record<AccentKey, AccentPalette> = {
  blue: {
    tile: 'bg-brand-50',
    text: 'text-brand-600',
    solid: 'bg-brand-600',
    border: 'border-brand-200',
    wash: 'from-brand-50/70',
    ring: 'group-hover:border-brand-300',
  },
  purple: {
    tile: 'bg-grape-50',
    text: 'text-grape-600',
    solid: 'bg-grape-600',
    border: 'border-grape-200',
    wash: 'from-grape-50/70',
    ring: 'group-hover:border-grape-300',
  },
  violet: {
    tile: 'bg-grape-100',
    text: 'text-grape-700',
    solid: 'bg-grape-600',
    border: 'border-grape-200',
    wash: 'from-grape-100/70',
    ring: 'group-hover:border-grape-300',
  },
  green: {
    tile: 'bg-leaf-50',
    text: 'text-leaf-600',
    solid: 'bg-leaf-600',
    border: 'border-leaf-200',
    wash: 'from-leaf-50/70',
    ring: 'group-hover:border-leaf-300',
  },
  orange: {
    tile: 'bg-sun-50',
    text: 'text-sun-600',
    solid: 'bg-sun-500',
    border: 'border-sun-200',
    wash: 'from-sun-50/70',
    ring: 'group-hover:border-sun-300',
  },
  pink: {
    tile: 'bg-rose-50',
    text: 'text-rose-500',
    solid: 'bg-rose-500',
    border: 'border-rose-200',
    wash: 'from-rose-50/70',
    ring: 'group-hover:border-rose-300',
  },
  sky: {
    tile: 'bg-sky-brand-50',
    text: 'text-sky-brand-600',
    solid: 'bg-sky-brand-500',
    border: 'border-sky-brand-200',
    wash: 'from-sky-brand-50/70',
    ring: 'group-hover:border-sky-brand-300',
  },
  amber: {
    tile: 'bg-sun-100',
    text: 'text-sun-700',
    solid: 'bg-sun-400',
    border: 'border-sun-200',
    wash: 'from-sun-100/70',
    ring: 'group-hover:border-sun-400',
  },
}

/** Per-accent landing tile tints, matching the reference colour strip. */
export const LANDING_TILE_ACCENT: Record<AccentKey, string> = {
  blue: 'bg-brand-50 text-brand-600',
  purple: 'bg-grape-50 text-grape-600',
  violet: 'bg-grape-100 text-grape-700',
  green: 'bg-leaf-50 text-leaf-600',
  orange: 'bg-sun-50 text-sun-600',
  pink: 'bg-rose-50 text-rose-500',
  sky: 'bg-sky-brand-50 text-sky-brand-600',
  amber: 'bg-sun-100 text-sun-700',
}

export function getAccent(key: AccentKey | undefined): AccentPalette {
  return ACCENTS[key ?? 'blue']
}
