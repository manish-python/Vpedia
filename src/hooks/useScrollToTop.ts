import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Resets scroll on navigation, and honours in-page hash links such as
 * `/#features`. Without this, React Router keeps the previous scroll offset
 * across route changes.
 */
export function useScrollToTop(): void {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      // Let the target section mount before scrolling to it.
      const timer = window.setTimeout(() => {
        const el = document.querySelector(hash)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
      return () => window.clearTimeout(timer)
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])
}
