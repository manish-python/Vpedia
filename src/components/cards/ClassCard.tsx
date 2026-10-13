import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'

import { ClassArtwork } from '@/components/illustrations/ClassArtwork'
import { Badge, PopularBadge } from '@/components/common/Badge'
import { getAccent } from '@/utils/accent'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { VClass } from '@/types'

/* ========================================================================
   Class card
   One card definition serves the landing grid, the class selection grid and
   the "my classes" list. Only the density changes.
   ===================================================================== */

export interface ClassCardProps {
  vClass: VClass
  /** Landing tiles are compact; selection and dashboard cards show price. */
  variant?: 'tile' | 'detail'
  isUnlocked?: boolean
  /** Dashboard locked cards show a purchase price instead of a CTA link. */
  showPrice?: boolean
  className?: string
}

export function ClassCard({
  vClass,
  variant = 'detail',
  isUnlocked = false,
  showPrice = true,
  className,
}: ClassCardProps) {
  const accent = getAccent(vClass.accent)
  const isTile = variant === 'tile'

  return (
    <Link
      to={`/classes/${vClass.id}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-center',
        'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        accent.ring,
        isTile ? 'p-3.5 shadow-card sm:p-4' : 'p-4 shadow-card sm:p-5',
        className,
      )}
    >
      {vClass.isPopular ? (
        <span className="absolute inset-x-0 top-0 flex justify-center">
          <span className="-translate-y-1/2 rounded-full bg-leaf-500 px-2.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-white uppercase shadow-sm">
            Most Popular
          </span>
        </span>
      ) : null}

      <div
        className={cn(
          'mx-auto flex items-center justify-center rounded-2xl',
          accent.tile,
          isTile ? 'size-11 sm:size-12' : 'size-14 sm:size-16',
        )}
      >
        {isTile ? (
          <span
            className={cn('text-xl font-extrabold sm:text-2xl', accent.text)}
            aria-hidden
          >
            {vClass.shortLabel}
          </span>
        ) : (
          <ClassArtwork classId={vClass.id} size={isTile ? 40 : 56} />
        )}
      </div>

      <h3
        className={cn(
          'mt-3 font-bold text-ink-900',
          isTile ? 'text-sm sm:text-base' : 'text-base sm:text-lg',
        )}
      >
        {vClass.name}
      </h3>

      {isTile ? (
        <p className="mt-0.5 text-xs font-medium text-ink-500 sm:text-sm">{vClass.tagline}</p>
      ) : (
        <>
          {showPrice ? (
            <p className={cn('mt-1.5 text-2xl font-extrabold nums', accent.text)}>
              {formatINR(vClass.price)}
            </p>
          ) : null}
          <p className="mt-1 text-sm font-medium text-ink-500">Complete Access</p>
        </>
      )}

      {isUnlocked ? (
        <span
          className={cn(
            'mt-2.5 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-leaf-200 bg-leaf-50 px-3',
            'text-sm font-semibold text-leaf-700',
          )}
        >
          <Check className="size-4" strokeWidth={3} aria-hidden />
          Unlocked
        </span>
      ) : (
        <span
          className={cn(
            'mt-2.5 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3',
            'text-sm font-semibold text-white transition-colors',
            'group-hover:brightness-105',
            vClass.accent === 'green'
              ? 'bg-leaf-600'
              : vClass.accent === 'violet'
                ? 'bg-grape-600'
                : vClass.accent === 'orange'
                  ? 'bg-sun-500'
                  : vClass.accent === 'sky'
                    ? 'bg-sky-brand-500'
                    : 'bg-brand-600',
          )}
        >
          View Details
          <ArrowRight className="size-4" aria-hidden />
        </span>
      )}

      {vClass.hasStreams ? (
        <p className="mt-2 text-[0.6875rem] font-semibold text-ink-400">
          Science · Commerce · Humanities
        </p>
      ) : null}
    </Link>
  )
}

/* ---------------------------------------------------------------------
   Pricing card — class selection grid, matching the reference layout
   ------------------------------------------------------------------ */

export interface PricingCardProps {
  vClass: VClass
  className?: string
}

export function PricingCard({ vClass, className }: PricingCardProps) {
  return (
    <div className={cn('relative', className)}>
      {vClass.isPopular ? (
        <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2">
          <PopularBadge />
        </span>
      ) : null}
      <ClassCard vClass={vClass} variant="detail" className="h-full pt-6 sm:pt-7" />
    </div>
  )
}

/* ---------------------------------------------------------------------
   Landing tile — the compact coloured number strip
   ------------------------------------------------------------------ */

export function ClassTile({ vClass }: { vClass: VClass }) {
  const accent = getAccent(vClass.accent)
  return (
    <Link
      to={`/classes/${vClass.id}`}
      className={cn(
        'group flex flex-col items-center gap-1 rounded-2xl border border-hairline bg-white p-3 text-center shadow-card',
        'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        accent.ring,
      )}
    >
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-xl text-lg font-extrabold sm:size-11 sm:text-xl',
          accent.tile,
          accent.text,
        )}
        aria-hidden
      >
        {vClass.shortLabel}
      </span>
      <span className="text-xs font-bold text-ink-900 sm:text-sm">{vClass.name}</span>
      <Badge tone="neutral" size="xs" className="mt-0.5">
        {vClass.tagline}
      </Badge>
    </Link>
  )
}
