import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { cn } from '@/utils/cn'
import { IconButton } from './IconButton'

/* ========================================================================
   Modal
   Accessible dialog: labelled, focus-trapped, Escape-dismissible, and it
   restores focus to the element that opened it.
   =================================================================== */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Hide the visual header but keep the accessible name. */
  hideHeader?: boolean
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  /** Wide enough to read a PDF page rather than just see it. */
  xl: 'max-w-5xl',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideHeader = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-900/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full animate-pop-in rounded-t-3xl border border-hairline bg-white shadow-pop',
          'max-h-[92dvh] overflow-y-auto sm:rounded-3xl',
          SIZES[size],
        )}
      >
        {!hideHeader ? (
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div>
              <h2 className="text-base font-bold text-ink-900">{title}</h2>
              {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
            </div>
            <IconButton label="Close dialog" size="sm" onClick={onClose}>
              <X className="size-4.5" aria-hidden />
            </IconButton>
          </div>
        ) : null}

        <div className="px-5 py-5">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-hairline px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
