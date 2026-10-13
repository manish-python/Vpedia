import type { LucideIcon } from 'lucide-react'
import { Check, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/utils/cn'
import { getAccent } from '@/utils/accent'
import type { AccentKey } from '@/types'

/* ========================================================================
   FeatureCard
   ===================================================================== */

export function FeatureCard({
  icon: Icon,
  title,
  description,
  accent = 'purple',
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  accent?: AccentKey
  className?: string
}) {
  const palette = getAccent(accent)
  return (
    <article
      className={cn(
        'group rounded-2xl border border-hairline bg-white p-5 text-center shadow-card',
        'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mx-auto flex size-12 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105',
          palette.tile,
        )}
      >
        <Icon className={cn('size-6', palette.text)} strokeWidth={2} />
      </span>
      <h3 className="mt-3.5 text-[0.9375rem] font-bold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">{description}</p>
    </article>
  )
}

/* ========================================================================
   LockedCard / UnlockedCard
   Access states for a purchased or unpurchased class.
   ===================================================================== */

export function UnlockedCard({
  title,
  description,
  ctaLabel,
  ctaTo,
  icon: Icon,
  children,
  className,
}: {
  title: string
  description: string
  ctaLabel: string
  ctaTo: string
  icon?: LucideIcon
  children?: React.ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border border-leaf-200 bg-leaf-50/60 p-4 shadow-card sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink-900">{title}</h3>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-leaf-100 px-2.5 py-0.5 text-xs font-bold text-leaf-700">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
            Unlocked
          </span>
        </div>
        {Icon ? (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-leaf-600 shadow-sm"
          >
            <Icon className="size-5" strokeWidth={2} />
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 text-sm text-ink-600">{description}</p>
      {children}

      <Link
        to={ctaTo}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-700"
      >
        {ctaLabel}
      </Link>
    </article>
  )
}

export function LockedCard({
  title,
  priceLabel,
  ctaLabel = 'Buy Now',
  ctaTo,
  icon: Icon,
  className,
}: {
  title: string
  priceLabel: string
  ctaLabel?: string
  ctaTo: string
  icon?: LucideIcon
  className?: string
}) {
  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border border-grape-200 bg-grape-50/60 p-4 shadow-card sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink-900">{title}</h3>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink-600 shadow-sm">
            <Lock className="size-3" strokeWidth={2.6} aria-hidden />
            Locked
          </span>
        </div>
        {Icon ? (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-grape-600 shadow-sm"
          >
            <Icon className="size-5" strokeWidth={2} />
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 text-sm text-ink-600">Complete access at {priceLabel}</p>

      <Link
        to={ctaTo}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-grape-600 px-4 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-grape-700"
      >
        {ctaLabel}
      </Link>
    </article>
  )
}

/* ========================================================================
   QuickActionCard — the dashboard quick-action tile
   ===================================================================== */

export function QuickActionCard({
  icon: Icon,
  label,
  to,
  accent = 'blue',
  className,
}: {
  icon: LucideIcon
  label: string
  to: string
  accent?: AccentKey
  className?: string
}) {
  const palette = getAccent(accent)
  return (
    <Link
      to={to}
      className={cn(
        'group flex h-full flex-col items-center gap-2.5 rounded-2xl border border-hairline bg-white p-4 text-center shadow-card',
        'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        palette.ring,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105',
          palette.tile,
        )}
      >
        <Icon className={cn('size-5.5', palette.text)} strokeWidth={2} />
      </span>
      <span className="text-sm font-semibold text-ink-800">{label}</span>
    </Link>
  )
}

/* ========================================================================
   Checklist — feature bullet list used on the purchase and class pages
   ===================================================================== */

export function Checklist({
  items,
  className,
  icon: Icon = Check,
  iconClassName = 'text-leaf-600',
}: {
  items: string[]
  className?: string
  icon?: LucideIcon
  iconClassName?: string
}) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <Icon className={cn('mt-0.5 size-4.5 shrink-0', iconClassName)} strokeWidth={2.6} aria-hidden />
          <span className="text-sm leading-relaxed text-ink-700 sm:text-[0.9375rem]">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/* ========================================================================
   FeatureRow - horizontal strip of factual product benefits. Not a testimonial
   row: there is no analytics in this codebase that could support a student
   count, a success rate or an accreditation claim, so none is asserted.
   ===================================================================== */

export function FeatureRow({
  icon: Icon,
  title,
  description,
  accent = 'green',
}: {
  icon: LucideIcon
  title: string
  description: string
  accent?: AccentKey
}) {
  const palette = getAccent(accent)
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', palette.tile)}
      >
        <Icon className={cn('size-5', palette.text)} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-ink-900">{title}</span>
        <span className="block truncate text-xs text-ink-500">{description}</span>
      </span>
    </div>
  )
}
