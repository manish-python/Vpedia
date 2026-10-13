import { useEffect } from 'react'

/** Freezes background scrolling while a modal or drawer is open. */
export function useLockBodyScroll(locked: boolean): void {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}
