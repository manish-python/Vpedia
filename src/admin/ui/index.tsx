/* ========================================================================
   Admin design-system primitives

   The vocabulary every admin screen is built from. Same visual identity as the
   student site — blue `brand`, white cards on `ink-50`, Lucide icons, rounded
   corners — but tuned for dense, data-heavy screens an administrator uses all
   day.

   Nothing here talks to the API or knows about a model. That is the point: a
   table, a toolbar, a stat card and an error state can be understood without
   reading a single line of business logic.
   ===================================================================== */

import { type ReactNode } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Skeleton } from '@/components/common/Skeleton'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------
   Page header
   ------------------------------------------------------------------ */

export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Primary action, usually "+ Add something". */
  action?: ReactNode
  /** Secondary actions beside the primary one. */
  secondary?: ReactNode
}

export function PageHeader({ title, subtitle, action, secondary }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500 sm:text-base">{subtitle}</p> : null}
      </div>
      {(action || secondary) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondary}
          {action}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Card
   ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-hairline bg-white shadow-sm',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CardTitle({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-ink-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Stat card
   ------------------------------------------------------------------ */

export interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  /** Small line under the value, e.g. "+2 this month". */
  hint?: string
  /** Renders as a button that drills into a related page. */
  onClick?: () => void
  tone?: 'brand' | 'amber' | 'emerald' | 'rose' | 'ink'
}

const TONE: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-700',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
  ink: 'bg-ink-100 text-ink-600',
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  onClick,
  tone = 'brand',
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</span>
        {icon ? (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', TONE[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="nums mt-3 text-2xl font-black leading-none text-ink-900 sm:text-3xl">{value}</p>
      {hint ? <p className="mt-2 text-xs font-semibold text-ink-500">{hint}</p> : null}
    </>
  )

  if (!onClick) {
    return <div className="rounded-2xl border border-hairline bg-white p-4 shadow-sm sm:p-5">{body}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-hairline bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:p-5"
    >
      {body}
    </button>
  )
}

/* ---------------------------------------------------------------------
   Status badge

   Never colour alone: every badge carries its own text label, so it still
   reads correctly in greyscale and to a screen reader.
   ------------------------------------------------------------------ */

export type StatusTone = 'positive' | 'warning' | 'danger' | 'neutral' | 'info'

const BADGE: Record<StatusTone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-200',
}

/** Maps a purchase/payment/content status string to a tone. */
export function toneForStatus(value: string): StatusTone {
  switch (value.toUpperCase()) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'PUBLISHED':
      return 'positive'
    case 'PENDING':
    case 'DRAFT':
      return 'warning'
    case 'REJECTED':
    case 'CANCELLED':
    case 'INACTIVE':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function StatusBadge({
  value,
  label,
  tone,
}: {
  value: string
  label?: string
  tone?: StatusTone
}) {
  const text = label ?? value.charAt(0) + value.slice(1).toLowerCase()
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset',
        BADGE[tone ?? toneForStatus(value)],
      )}
    >
      {text}
    </span>
  )
}

/* ---------------------------------------------------------------------
   Toolbar — search, filters, clear
   ------------------------------------------------------------------ */

export interface FilterOption {
  value: string
  label: string
}

export interface ToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  /** Each entry renders one labelled <select>. */
  filters?: Array<{
    key: string
    label: string
    value: string
    options: FilterOption[]
    onChange: (value: string) => void
  }>
  onClear?: () => void
  /** Rendered on the right, e.g. an "Export" or view switch. */
  trailing?: ReactNode
}

export function Toolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onClear,
  trailing,
}: ToolbarProps) {
  const hasFilters = filters.some((filter) => filter.value !== '')
  const dirty = search !== '' || hasFilters

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-hairline bg-white px-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
          <Search className="size-4 shrink-0 text-ink-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full min-w-0 bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-400"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="shrink-0 rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        {trailing}
      </div>

      {filters.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <label key={filter.key} className="relative">
              <span className="sr-only">{filter.label}</span>
              <select
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
                className={cn(
                  'appearance-none rounded-xl border bg-white py-2 pl-3 pr-8 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-100',
                  filter.value
                    ? 'border-brand-300 text-brand-700'
                    : 'border-hairline text-ink-600 hover:border-ink-300',
                )}
              >
                <option value="">{filter.label}: All</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronRight
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-ink-400"
              />
            </label>
          ))}
          {dirty && onClear ? (
            <Button variant="ghost" size="sm" onClick={onClear} leadingIcon={<X className="size-4" />}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Data table

   Desktop gets a real table. Below `md` each row becomes a card, because a
   horizontally-scrolling seven-column table on a phone is unusable — and this
   avoids the horizontal page overflow the brief rules out.
   ------------------------------------------------------------------ */

export interface Column<T> {
  key: string
  header: string
  /** Cell content. Omit on small screens to keep the card readable. */
  cell: (row: T) => ReactNode
  /** Hidden below `md` inside the mobile card when false. */
  showOnMobile?: boolean
  /** Right-aligns both the header and the cell. */
  align?: 'right'
  className?: string
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string | number
  /** Called on click/tap. Makes rows interactive. */
  onRowClick?: (row: T) => void
  empty?: ReactNode
  loading?: boolean
  /** Skeleton row count while loading. */
  skeletonRows?: number
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading = false,
  skeletonRows = 6,
}: DataTableProps<T>) {
  if (loading) return <TableSkeleton columns={columns.length} rows={skeletonRows} />
  if (!rows.length) return <>{empty ?? <TableEmpty />}</>

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-hairline bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-hairline bg-ink-50/60">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500',
                    column.align === 'right' && 'text-right',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-ink-100 last:border-0 transition',
                  onRowClick && 'cursor-pointer hover:bg-brand-50/40 focus-within:bg-brand-50/40',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 align-middle text-ink-700',
                      column.align === 'right' && 'text-right',
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row */}
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              className={cn(
                'rounded-2xl border border-hairline bg-white p-4 shadow-sm',
                onRowClick && 'cursor-pointer transition active:bg-brand-50/50',
              )}
            >
              <dl className="space-y-2">
                {columns
                  .filter((column) => column.showOnMobile !== false)
                  .map((column, index) => (
                    <div
                      key={column.key}
                      className={cn(
                        'flex items-start justify-between gap-3',
                        index === 0 && 'pb-1',
                      )}
                    >
                      <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-400">
                        {column.header}
                      </dt>
                      <dd className="min-w-0 text-right text-sm text-ink-700">{column.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function TableSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
      <div className="border-b border-hairline bg-ink-50/60 px-4 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-ink-100 px-4 py-4 last:border-0">
          {Array.from({ length: columns }, (_, cell) => (
            <Skeleton key={cell} className={cn('h-3', cell === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function TableEmpty({
  title = 'Nothing here yet',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
      <p className="font-bold text-ink-700">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Error state

   One component for every failed panel. It shows a sentence, never a status
   code, a stack trace or anything else the server sent.
   ------------------------------------------------------------------ */

export interface ErrorStateProps {
  message: string
  onRetry?: () => void
  title?: string
  compact?: boolean
}

export function ErrorState({ message, onRetry, title = 'Unable to load', compact }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-2xl border border-rose-200 bg-rose-50 text-rose-900',
        compact ? 'p-4' : 'p-6 text-center',
      )}
    >
      <div className={cn('flex gap-3', compact ? 'items-start' : 'flex-col items-center')}>
        <AlertTriangle
          aria-hidden
          className={cn('size-5 shrink-0 text-rose-600', !compact && 'size-6')}
        />
        <div className="min-w-0">
          <p className={cn('font-bold', !compact && 'text-base')}>{title}</p>
          <p className="mt-1 break-words text-sm text-rose-800">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <div className={cn('mt-4', !compact && 'flex justify-center')}>
          <Button variant="outline" size="sm" onClick={onRetry} leadingIcon={<RefreshCw className="size-4" />}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Pagination

   Server-side, 25 rows a page, with real page numbers so an administrator can
   jump rather than click Next repeatedly.
   ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageCount,
  onChange,
  total,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
  total: number
}) {
  if (pageCount <= 1) return null

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="nums text-sm text-ink-500">
        Page {page} of {pageCount} · {total} total
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          leadingIcon={<ChevronLeft className="size-4" />}
        >
          <span className="hidden sm:inline">Previous</span>
          <span className="sm:hidden">Prev</span>
        </Button>
        {pageNumbers(page, pageCount).map((entry, index) =>
          entry === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-ink-400">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === page ? 'page' : undefined}
              onClick={() => onChange(entry)}
              className={cn(
                'nums size-9 rounded-lg text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                entry === page
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-ink-600 hover:bg-ink-100',
              )}
            >
              {entry}
            </button>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          trailingIcon={<ChevronRight className="size-4" />}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}

/**
 * Page numbers to show: always first, last, current and its neighbours, with a
 * gap marker between the groups.
 */
function pageNumbers(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1])
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b)

  const out: Array<number | 'gap'> = []
  let previous = 0
  for (const value of sorted) {
    if (previous && value - previous > 1) out.push('gap')
    out.push(value)
    previous = value
  }
  return out
}

/* ---------------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------------ */

/** `₹1,234.00` from a decimal string. Never throws on a null-ish value. */
export function money(value: string | number | null | undefined, currency = '₹'): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return `${currency}0`
  return `${currency}${amount.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

/** "5 min ago", "3 days ago". Falls back to a date for anything older. */
export function relativeTime(value: string): string {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`

  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Absolute timestamp, for tooltips next to a relative time. */
export function absoluteTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN')
}

/** Noun helper: 1 chapter / 4 chapters. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}