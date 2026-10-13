/* ========================================================================
   Admin charts

   Deliberately not a charting library. These four visualisations answer four
   specific questions on the dashboard, and each one is a few lines of CSS or
   SVG. Adding ~100kb of dependency for that would cost more than it returns.

   Every chart degrades to readable text: each value is printed alongside the
   mark, the marks carry `aria-hidden`, and the container has a text summary for
   screen readers. Colour is a secondary cue, never the only one.
   ===================================================================== */

import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------
   Horizontal bar list

   Best for a handful of labelled categories (purchases per class, content by
   type) where the label matters more than the shape.
   ------------------------------------------------------------------ */

export interface BarDatum {
  label: string
  value: number
  /** Optional right-hand annotation, e.g. a percentage. */
  note?: string
}

export function BarList({
  data,
  emptyLabel = 'No data yet',
  tone = 'brand',
  onSelect,
}: {
  data: BarDatum[]
  emptyLabel?: string
  tone?: 'brand' | 'emerald' | 'amber'
  onSelect?: (label: string) => void
}) {
  const max = Math.max(...data.map((datum) => datum.value), 1)
  const total = data.reduce((sum, datum) => sum + datum.value, 0)

  const FILL = {
    brand: 'bg-brand-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
  } as const

  if (!data.length || total === 0) {
    return <p className="py-6 text-center text-sm text-ink-400">{emptyLabel}</p>
  }

  return (
    <ul className="space-y-2.5">
      {data.map((datum) => {
        const percent = Math.round((datum.value / max) * 100)
        const share = total ? Math.round((datum.value / total) * 100) : 0

        const row = (
          <>
            <span className="flex w-full items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-ink-700">{datum.label}</span>
              <span className="nums shrink-0 font-bold text-ink-900">
                {datum.value}
                {datum.note ? <span className="ml-1 text-xs font-semibold text-ink-400">{datum.note}</span> : null}
              </span>
            </span>
            <span
              aria-hidden
              className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-ink-100"
            >
              <span
                className={cn('block h-full rounded-full transition-[width] duration-500', FILL[tone])}
                style={{ width: `${Math.max(percent, datum.value > 0 ? 4 : 0)}%` }}
              />
            </span>
          </>
        )

        return (
          <li key={datum.label}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(datum.label)}
                className="block w-full rounded-lg text-left transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {row}
              </button>
            ) : (
              <div>{row}</div>
            )}
            <span className="sr-only">
              {datum.label}: {datum.value}, {share}% of total
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/* ---------------------------------------------------------------------
   Stacked status bar

   One bar split by status, with a legend. Compact enough for a card header.
   ------------------------------------------------------------------ */

export interface StatusSegment {
  label: string
  value: number
  className: string
}

export function StatusBar({ segments, total }: { segments: StatusSegment[]; total?: number }) {
  const sum = total ?? segments.reduce((acc, segment) => acc + segment.value, 0)

  if (!sum) {
    return <p className="py-4 text-center text-sm text-ink-400">Nothing recorded yet</p>
  }

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100" aria-hidden>
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span
              key={segment.label}
              className={segment.className}
              style={{ width: `${(segment.value / sum) * 100}%` }}
            />
          ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2">
            <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', segment.className)} />
            <dt className="truncate text-xs font-semibold text-ink-500">{segment.label}</dt>
            <dd className="nums ml-auto text-sm font-bold text-ink-900">{segment.value}</dd>
          </div>
        ))}
      </dl>
      <p className="sr-only">
        {segments.map((segment) => `${segment.label} ${segment.value}`).join(', ')}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Registration trend

   A small column chart over the last two weeks. Columns rather than a line
   because daily counts are integers and the zero-days matter.
   ------------------------------------------------------------------ */

export interface TrendDatum {
  date: string
  count: number
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-ink-400">No registrations yet</p>
  }

  const max = Math.max(...data.map((point) => point.count), 1)
  const peak = data.reduce((best, point) => (point.count > best.count ? point : best), data[0]!)
  const firstLabel = formatDay(data[0]!.date)
  const lastLabel = formatDay(data[data.length - 1]!.date)

  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]" aria-hidden>
        {data.map((point) => (
          <span
            key={point.date}
            title={`${formatDay(point.date)}: ${point.count}`}
            className={cn(
              'min-h-[2px] flex-1 rounded-t-sm transition-[height] duration-500',
              point.count > 0 ? 'bg-brand-500' : 'bg-ink-100',
            )}
            style={{ height: `${point.count ? Math.max((point.count / max) * 100, 8) : 3}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs font-semibold text-ink-400">
        <span>{firstLabel}</span>
        <span>
          Peak {peak.count} on {formatDay(peak.date)}
        </span>
        <span>{lastLabel}</span>
      </div>

      <p className="sr-only">
        Daily registrations over the last {data.length} days:{' '}
        {data.map((point) => `${formatDay(point.date)} ${point.count}`).join(', ')}.
      </p>
    </div>
  )
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/* ---------------------------------------------------------------------
   Donut

   A single ring for one number against a total — used for "published vs
   draft". The exact numbers are printed beside it, so the ring is decoration
   that supports the figure rather than the figure itself.
   ------------------------------------------------------------------ */

export function Donut({
  value,
  total,
  label,
  caption,
}: {
  value: number
  total: number
  label: string
  caption?: string
}) {
  const percent = total > 0 ? Math.min((value / total) * 100, 100) : 0
  const degrees = (percent / 100) * 360

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative size-20 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(var(--color-brand-500) ${degrees}deg, var(--color-ink-100) ${degrees}deg)`,
        }}
        aria-hidden
      >
        <span className="absolute inset-[9px] flex items-center justify-center rounded-full bg-white">
          <span className="nums text-lg font-black text-ink-900">{Math.round(percent)}%</span>
        </span>
      </div>
      <div className="min-w-0">
        <p className="nums text-2xl font-black text-ink-900">{label}</p>
        {caption ? <p className="mt-0.5 text-sm text-ink-500">{caption}</p> : null}
      </div>
    </div>
  )
}