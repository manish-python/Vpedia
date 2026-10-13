import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

/* ========================================================================
   Card
   The base surface for every tile, panel and row in the product.
   =================================================================== */

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
}

export type CardElevation = 'flat' | 'raised' | 'floating'

const ELEVATION: Record<CardElevation, string> = {
  flat: 'shadow-none',
  raised: 'shadow-card',
  floating: 'shadow-panel',
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: CardPadding
  elevation?: CardElevation
  interactive?: boolean
  as?: 'div' | 'article' | 'section' | 'li'
}

export function Card({
  padding = 'md',
  elevation = 'raised',
  interactive = false,
  as: Tag = 'div',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-hairline bg-white',
        PADDING[padding],
        ELEVATION[elevation],
        interactive &&
          'group transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/* ---------------------------------------------------------------------
   CardHeader / CardBody / CardFooter — optional composition helpers
   ------------------------------------------------------------------ */

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('text-sm leading-relaxed text-ink-600', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...rest}>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Section wrapper — consistent page rhythm
   ------------------------------------------------------------------ */

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  tone?: 'canvas' | 'white' | 'mesh' | 'none'
  padding?: 'sm' | 'md' | 'lg'
}

const TONES: Record<NonNullable<SectionProps['tone']>, string> = {
  canvas: 'bg-canvas',
  white: 'bg-white',
  mesh: 'bg-mesh',
  none: '',
}

const SECTION_PADDING: Record<NonNullable<SectionProps['padding']>, string> = {
  sm: 'py-10 sm:py-12',
  md: 'py-14 sm:py-18',
  lg: 'py-16 sm:py-24',
}

export function Section({
  tone = 'canvas',
  padding = 'lg',
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section className={cn(TONES[tone], SECTION_PADDING[padding], className)} {...rest}>
      {children}
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  as: Tag = 'h2',
  className,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: 'center' | 'left'
  as?: 'h1' | 'h2' | 'h3'
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow ? (
        <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">
          {eyebrow}
        </span>
      ) : null}
      <Tag className="text-2xl sm:text-3xl lg:text-[2.125rem]">{title}</Tag>
      {subtitle ? (
        <p className={cn('text-ink-500', align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-2xl')}>
          {subtitle}
        </p>
      ) : null}
      {children}
    </div>
  )
}
