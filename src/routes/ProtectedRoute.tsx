import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

import { Loader } from '@/components/common/Spinner'
import { UnauthorizedState } from '@/components/common/EmptyState'
import { useAsync } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { resolveChapter, resolveSubject } from '@/services/resolveService'
import type { ClassId } from '@/types'

/* ========================================================================
   Route guards
   ---------------------------------------------------------------------
   IMPORTANT: these protect the UI flow only. They stop a student from
   reaching a screen they have not paid for; they are NOT security.

   The Django backend authorises every content request independently — the
   document route re-checks `has_class_access` before returning a byte — so
   bypassing this guard reveals a locked screen, never a file.

   Ownership comes from the backend: `usePurchase().unlockedClasses` is
   derived from purchase records the API returned, and only ACTIVE ones. No
   local fixture and no browser storage is consulted.
   =================================================================== */

/** Requires a signed-in student. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, isRestoring } = useAuth()
  const location = useLocation()

  // Hold the screen while the session is being restored, so a refresh on a
  // protected page never flashes the login redirect.
  if (isRestoring || status === 'authenticating') {
    return <Loader label="Checking your session…" />
  }

  if (status === 'unauthenticated' || status === 'error') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

/**
 * Requires a chosen class.
 *
 * `StudentProfile.selected_class` is NULL until the student picks one, and it
 * is never defaulted. Without this guard a brand-new student landed on a
 * dashboard that had to invent something to display, and it invented Class 7 —
 * the first class in the catalogue — inside a heading called "Your Classes".
 *
 * A student who already has an active purchase is left alone: changing class
 * later must not lock them out of what they paid for, and forcing them through
 * a picker to re-choose would be an obstacle rather than a help.
 */
export function ClassSelectionRoute({ children }: { children: ReactNode }) {
  const { user, isRestoring } = useAuth()
  const { purchases, isLoading: purchasesLoading } = usePurchase()
  const location = useLocation()

  if (isRestoring) return <Loader label="Checking your session…" />

  const selected = user?.currentClassId ?? null
  // Already chose a class, or already owns one: nothing to do here.
  const ownsSomething = purchases.some((purchase) => purchase.status === 'success')

  if (selected !== null || ownsSomething || purchasesLoading) {
    return <>{children}</>
  }

  return (
    <Navigate
      to="/select-class"
      replace
      state={{ from: location.pathname + location.search }}
    />
  )
}

/** Requires a purchased class. The class id comes from the route. */
export function ClassProtectedRoute({
  children,
  classId,
}: {
  children: ReactNode
  classId: number | undefined
}) {
  const { isUnlocked, isLoading } = usePurchase()

  if (isLoading) return <Loader label="Checking your access…" />
  if (!classId || !isUnlocked(classId as ClassId)) {
    return (
      <UnauthorizedState message="You need to purchase this class to access this content." />
    )
  }

  return <>{children}</>
}

/**
 * Requires an active purchase for the class that owns a subject or chapter.
 *
 * The URL carries only a slug, so the owning class is resolved from the API
 * rather than by slicing the slug — a subject named "Social Science" would
 * otherwise break any prefix arithmetic. The resolution is one cached request
 * per slug, shared with the page underneath.
 */
export function ContentProtectedRoute({
  children,
  subjectId,
  chapterId,
}: {
  children: ReactNode
  subjectId?: string
  chapterId?: string
}) {
  const { isUnlocked, isLoading } = usePurchase()
  const slug = chapterId ?? subjectId

  const { data: resolved, isLoading: resolving } = useAsync(
    async (signal) => {
      if (!slug) return null
      return chapterId ? resolveChapter(chapterId, signal) : resolveSubject(subjectId!, signal)
    },
    [slug],
    { enabled: Boolean(slug) },
  )

  if (isLoading || resolving) return <Loader label="Checking your access…" />

  const classId = resolved?.vClass.id

  if (!classId) {
    return (
      <UnauthorizedState message="We could not work out which class this content belongs to." />
    )
  }

  if (!isUnlocked(classId)) {
    return <UnauthorizedState message="You need to purchase this class to access this content." />
  }

  return <>{children}</>
}
