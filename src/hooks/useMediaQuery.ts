import { useCallback, useSyncExternalStore } from 'react'

/* ========================================================================
   Media queries
   ---------------------------------------------------------------------
   Built on useSyncExternalStore so the browser's matchMedia result is
   treated as an external store rather than mirrored into state inside an
   effect. This keeps rendering pure and avoids a cascading render on mount.
   ===================================================================== */

function subscribe(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }
}

function getSnapshot(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

/**
 * Subscribes to a CSS media query.
 * Used for genuine behavioural differences (mobile bottom nav, sidebar
 * collapse), not for shrinking desktop layouts.
 */
export function useMediaQuery(query: string): boolean {
  const subscribeToQuery = useCallback(
    (onChange: () => void) => subscribe(query)(onChange),
    [query],
  )
  const readSnapshot = useCallback(() => getSnapshot(query), [query])

  return useSyncExternalStore(subscribeToQuery, readSnapshot, () => false)
}

/** Tailwind-aligned breakpoints. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)')
export const useIsTablet = () => useMediaQuery('(max-width: 1023px)')
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')
