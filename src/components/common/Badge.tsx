import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'
import { Check, Lock, Sparkles } from 'lucide-react'

/* ========================================================================
   Badge
   Status is always conveyed by an icon or text as well as colour, so state
   is never communicated by colour alone.
   =================================================================== */

export type BadgeTone =
  | 'brand'
  | 'grape'
  | 'leaf'
  | 'sun'
  | 'rose'
  | 'sky'
  | 'neutral'
  | 'outline'

export type BadgeSize = 'xs' | 'sm'

const TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  grape: 'bg-grape-50 text-grape-700 border-grape-200',
  leaf: 'bg-leaf-50 text-leaf-700 border-leaf-200',
  sun: 'bg-sun-50 text-sun-700 border-sun-200',
  rose: 'bg-rose-50 text-rose-600 border-rose-200',
  sky: 'bg-sky-brand-50 text-sky-brand-600 border-sky-brand-200',
  neutral: 'bg-ink-100 text-ink-600 border-ink-200',
  outline: 'bg-white text-ink-600 border-ink-200',
}

const SIZES: Record<BadgeSize, string> = {
  xs: 'h-5 px-2 text-[0.6875rem] gap-1',
  sm: 'h-6 px-2.5 text-xs gap-1.5',
}

export interface BadgeProps {
  tone?: BadgeTone
  size?: BadgeSize
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({
  tone = 'brand',
  size = 'sm',
  icon,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold whitespace-nowrap',
        TONES[tone],
        SIZES[size],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------------
   Semantic status badges — used across class, subject and content rows
   ------------------------------------------------------------------ */

export function UnlockedBadge({ size = 'sm' }: { size?: BadgeSize }) {
  return (
    <Badge tone="leaf" size={size} icon={<Check className="size-3.5" strokeWidth={3} aria-hidden />}>
      Unlocked
    </Badge>
  )
}

export function LockedBadge({ size = 'sm', label = 'Locked' }: { size?: BadgeSize; label?: string }) {
  return (
    <Badge tone="neutral" size={size} icon={<Lock className="size-3" strokeWidth={2.5} aria-hidden />}>
      {label}
    </Badge>
  )
}

export function PopularBadge({ size = 'sm' }: { size?: BadgeSize }) {
  return (
    <Badge
      tone="leaf"
      size={size}
      icon={<Sparkles className="size-3.5" strokeWidth={2.5} aria-hidden />}
    >
      Most Popular
    </Badge>
  )
}

export function RecommendedBadge({ size = 'sm' }: { size?: BadgeSize }) {
  return <Badge tone="leaf" size={size}>Recommended</Badge>
}

export function ActiveBadge({ size = 'sm' }: { size?: BadgeSize }) {
  return (
    <Badge tone="leaf" size={size} icon={<Check className="size-3.5" strokeWidth={3} aria-hidden />}>
      Active
    </Badge>
  )
}
