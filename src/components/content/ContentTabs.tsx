import { cn } from '@/utils/cn'
import type { ContentType } from '@/types'

/* ========================================================================
   ContentTabs
   Underlined tab row implementing the ARIA tabs pattern: arrow keys move
   between tabs, Home/End jump to the ends, and the active tab is announced
   via aria-selected rather than colour alone.
   ===================================================================== */

export interface ContentTab {
  type: ContentType
  label: string
  count?: number
}

export interface ContentTabsProps {
  tabs: ContentTab[]
  active: ContentType
  onChange: (type: ContentType) => void
  className?: string
}

export function ContentTabs({ tabs, active, onChange, className }: ContentTabsProps) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.type === active)
    if (index === -1) return

    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return

    event.preventDefault()
    const target = tabs[next]
    if (target) onChange(target.type)
  }

  return (
    <div className={cn('no-scrollbar -mx-1 overflow-x-auto', className)}>
      <div
        role="tablist"
        aria-label="Content type"
        onKeyDown={onKeyDown}
        className="flex min-w-max gap-1 border-b border-hairline px-1"
      >
        {tabs.map((tab) => {
          const isActive = tab.type === active
          return (
            <button
              key={tab.type}
              type="button"
              role="tab"
              id={`tab-${tab.type}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.type}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.type)}
              className={cn(
                'relative shrink-0 px-4 py-3 text-sm font-semibold transition-colors',
                isActive ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {tab.label}
                {tab.count !== undefined ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold nums',
                      isActive ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600',
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600 transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
