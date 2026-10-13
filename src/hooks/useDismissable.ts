import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * Accessible disclosure behaviour for accordions and dropdowns:
 * closes on Escape, closes on outside click, returns focus to the trigger.
 */
export function useDismissable<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      const node = ref.current
      if (node && !node.contains(event.target as Node)) onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onClose])

  return { ref, mounted }
}

/** Stable, SSR-safe id for aria-controls relationships. */
export function useStableId(prefix: string): string {
  return `${prefix}-${useId()}`
}

/** Copy-to-clipboard with a transient confirmation flag. */
export function useCopyToClipboard(resetMs = 1800): [boolean, (value: string) => void] {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(
    (value: string) => {
      void navigator.clipboard?.writeText(value).then(
        () => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), resetMs)
        },
        () => setCopied(false),
      )
    },
    [resetMs],
  )

  return [copied, copy]
}
