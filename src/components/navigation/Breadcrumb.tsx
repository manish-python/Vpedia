import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/utils/cn'

/* ========================================================================
   Breadcrumb
   Nav landmark with the current page marked aria-current. Only the trail
   is exposed to assistive tech, not the decorative separators.
   ===================================================================== */

export interface Crumb {
  label: string
  /** Omit on the final crumb — it becomes the aria-current page. */
  to?: string
}

export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="shrink-0">
                {item.to && !isLast ? (
                  <Link
                    to={item.to}
                    className="rounded px-1 py-0.5 font-medium text-ink-500 transition-colors hover:text-brand-700"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={cn(
                      'block max-w-[10rem] truncate px-1 py-0.5 sm:max-w-none',
                      isLast ? 'font-semibold text-ink-900' : 'font-medium text-ink-500',
                    )}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden className="shrink-0 text-ink-300">
                  <ChevronRight className="size-4" />
                </li>
              ) : null}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
