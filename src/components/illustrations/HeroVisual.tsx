import { Check, FileText, Sparkles } from 'lucide-react'

import { cn } from '@/utils/cn'

/* ========================================================================
   Hero visual — a preview of the product's actual material.
   ---------------------------------------------------------------------
   Replaces a generic student-at-a-desk figure with a layered composition of
   what VPEDIA sells: chapter-wise notes, previous year questions, practice
   papers, and the class badges.

   Built from divs rather than an image: no network asset, no layout shift, and
   crisp at every width from 360px to 1440px.

   Layout note, learned the hard way
   ---------------------------------
   The first version positioned the accent badges absolutely (-top-4, -left-2
   and friends). At tablet width they collided with each other, escaped the
   panel, and clipped the card underneath. Nothing here is absolutely
   positioned now: the sheets sit in a grid, the badges sit in a real row beneath
   them, and the ambient wash is a background layer behind everything. Overflow
   is therefore impossible at any width rather than merely unlikely.

   The whole composition is decorative, so it is aria-hidden and the hero's
   surrounding copy carries the accessible text. The labels are the real content
   types the student will find in the app, not invented filler.
   =================================================================== */

/** Abbreviated for a narrow chip rail; the full names appear on the pages. */
const CHAPTER_CHIPS = [
  { label: 'Notes', active: true },
  { label: 'PYQs', active: false },
  { label: 'Solved', active: false },
  { label: 'Practice', active: false },
] as const

/** The catalogue range, 7-12. */
const CLASS_BADGES = [
  { short: '7', tone: 'bg-brand-50 text-brand-700' },
  { short: '8', tone: 'bg-grape-50 text-grape-700' },
  { short: '9', tone: 'bg-sun-50 text-sun-700' },
  { short: '10', tone: 'bg-leaf-50 text-leaf-700' },
  { short: '11', tone: 'bg-sky-brand-50 text-sky-brand-700' },
  { short: '12', tone: 'bg-rose-50 text-rose-700' },
] as const

/** Decorative rules standing in for printed lines on a page. */
const RULE_WIDTHS = [100, 94, 98, 72] as const

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-3xl border border-hairline bg-white p-4 shadow-panel sm:p-5 lg:p-6',
        className,
      )}
    >
      {/* Ambient wash. `overflow-hidden` above guarantees it cannot bleed past
          the rounded corners, and it sits behind the content in normal flow. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-white to-grape-50" />

      {/* ---- Document stack ----
          `sm:` switches from one column to two. Below that the sheets stack,
          which is the only way both stay legible at 360px. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-4">
        {/* Previous-year question paper */}
        <div className="animate-float-slow rotate-[-2deg] rounded-2xl border border-hairline bg-white p-3.5 shadow-card">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-grape-50 text-grape-600">
              <FileText className="size-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              {/* Two lines rather than one long one, so it never truncates. */}
              <p className="text-xs font-bold leading-tight text-ink-900">
                Previous Year
                <br />
                Questions
              </p>
            </div>
          </div>

          <ul className="mt-3 space-y-2">
            {['1.', '2.', '3.'].map((n) => (
              <li key={n} className="flex items-start gap-2">
                <span className="shrink-0 text-[0.625rem] font-bold leading-none text-grape-500">
                  {n}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block h-1 w-full rounded-full bg-ink-100" />
                  <span className="block h-1 w-3/5 rounded-full bg-ink-100" />
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Chapter-wise notes — the primary artefact, so it carries the accent. */}
        <div className="rounded-2xl border border-brand-100 bg-white p-3.5 shadow-pop sm:p-4">
          <div className="flex items-start gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FileText className="size-4.5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight text-ink-900">Real Numbers</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-ink-500">
                <span className="inline-flex items-center gap-1 font-semibold text-leaf-600">
                  <Check className="size-3" strokeWidth={3.5} aria-hidden />
                  PDF
                </span>
                <span aria-hidden>·</span>
                <span>24 pages</span>
              </p>
            </div>
          </div>

          <ul className="mt-3.5 space-y-2">
            {RULE_WIDTHS.map((w, i) => (
              <li
                key={i}
                className="h-1.5 rounded-full bg-ink-100"
                style={{ width: `${w}%` }}
              />
            ))}
          </ul>

          <ul className="mt-4 flex flex-wrap gap-1.5">
            {CHAPTER_CHIPS.map((chip) => (
              <li
                key={chip.label}
                className={cn(
                  'rounded-md px-2 py-1 text-[0.625rem] font-bold',
                  chip.active ? 'bg-brand-600 text-white' : 'bg-canvas-deep text-ink-600',
                )}
              >
                {chip.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ---- Badge row: normal flow, so it can never overlap the sheets ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline pt-4 sm:mt-5 sm:pt-5">
        {/* Class range */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[0.6875rem] font-bold text-ink-500">Classes</span>
          <ul className="flex min-w-0 flex-wrap gap-1">
            {CLASS_BADGES.map((badge) => (
              <li
                key={badge.short}
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-md text-[0.625rem] font-extrabold',
                  badge.tone,
                )}
              >
                {badge.short}
              </li>
            ))}
          </ul>
        </div>

        <span className="hidden h-4 w-px bg-hairline sm:block" aria-hidden />

        {/* The two factual promises that matter to a prospective student. */}
        <ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-[0.6875rem] font-bold text-ink-700">
          <li className="inline-flex items-center gap-1.5">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-leaf-500 text-white">
              <Check className="size-2.5" strokeWidth={4} aria-hidden />
            </span>
            One-time access
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sun-100 text-sun-700">
              <Sparkles className="size-2.5" strokeWidth={2.6} aria-hidden />
            </span>
            Solved &amp; marked
          </li>
        </ul>
      </div>
    </div>
  )
}