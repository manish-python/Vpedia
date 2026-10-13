import { cn } from '@/utils/cn'

/* ========================================================================
   ContentFilter
   A labelled native select. Native is deliberate here: it gives correct
   keyboard behaviour and the platform picker on mobile for free.
   =================================================================== */

export interface ContentFilterOption {
  value: string
  label: string
  count?: number
}

export interface ContentFilterProps {
  label: string
  value: string
  options: ContentFilterOption[]
  onChange: (value: string) => void
  className?: string
}

export function ContentFilter({
  label,
  value,
  options,
  onChange,
  className,
}: ContentFilterProps) {
  return (
    <label className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-ink-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-hairline bg-white px-3 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 focus-visible:border-brand-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.count !== undefined ? ` (${option.count})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ---------------------------------------------------------------------
   SegmentedControl — the tab-style switcher used by My Library
   ------------------------------------------------------------------ */

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  count?: number
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1', className)}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-brand-600 text-white shadow-brand'
                : 'bg-white text-ink-600 hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold nums',
                  isActive ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
