import { useId, useState, type ReactNode } from 'react'

import { cn } from '@/utils/cn'

/* ========================================================================
   Tooltip
   CSS-positioned so it works without an extra dependency. Opens on hover
   and on keyboard focus, and is wired to the trigger with aria-describedby.
   =================================================================== */

export interface TooltipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const POSITIONS = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
} as const

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const generatedId = useId()
  const id = `tooltip-${generatedId}`

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-56 rounded-lg bg-ink-900 px-2.5 py-1.5',
            'text-xs font-medium text-white shadow-pop animate-fade-in',
            POSITIONS[side],
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}
