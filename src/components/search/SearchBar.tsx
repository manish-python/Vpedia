import { forwardRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Search, X } from 'lucide-react'

import { cn } from '@/utils/cn'

/* ========================================================================
   SearchBar
   A real form with a labelled input, a clear button and a submit affordance.
   `role="search"` lets assistive tech jump straight to it.
   ===================================================================== */

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  autoFocus?: boolean
  className?: string
  id?: string
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    value,
    onChange,
    onSubmit,
    placeholder = 'Search…',
    size = 'md',
    autoFocus = false,
    className,
    id = 'search-input',
  },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false)

  const heights = { sm: 'h-10', md: 'h-11', lg: 'h-12' } as const
  const icons = { sm: 'size-4', md: 'size-4.5', lg: 'size-5' } as const
  const text = { sm: 'text-sm', md: 'text-[0.9375rem]', lg: 'text-base' } as const

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit?.(value)
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 transition-colors',
          isFocused && 'text-brand-500',
          icons[size],
        )}
      >
        <Search strokeWidth={2.2} />
      </span>

      <input
        ref={ref}
        id={id}
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoComplete="off"
        className={cn(
          'w-full rounded-xl border bg-white pl-11 text-ink-900 placeholder:text-ink-400',
          'transition-[border-color,box-shadow] duration-150',
          '[&::-webkit-search-cancel-button]:appearance-none',
          heights[size],
          text[size],
          isFocused
            ? 'border-brand-400 shadow-[0_0_0_3px_rgb(37_99_235/0.1)]'
            : 'border-hairline hover:border-brand-300',
          value ? 'pr-11' : 'pr-4',
        )}
      />

      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </form>
  )
})
