import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  createPurchase,
  fetchPurchases,
  isPurchaseActive,
} from '@/services/purchaseService'
import type { ClassId, Purchase, PurchaseStatus, StreamId } from '@/types'
import { useAuth } from './AuthContext'

/* ========================================================================
   PurchaseContext
   ---------------------------------------------------------------------
   Owns the single source of truth for "what has this student bought".

   Design rules:
   • One class = one payment = complete access to that class only.
   • A Class 10 purchase never unlocks 7, 8, 9, 11 or 12.
   • The unlocked list is derived from purchase records the BACKEND
     returned, and only from ACTIVE ones. It is never seeded, never
     persisted in the browser, and never set optimistically.
   • Class 11 / 12 purchases carry the chosen stream.

   The previous implementation seeded a fake ACTIVE Class 10 purchase into
   `sessionStorage`. That is gone: once a page can read it, a fabricated
   "success" row is indistinguishable from a real one.

   Note this context drives UI affordances only. The backend re-checks
   `has_class_access` on every request, so a wrong value here would at worst
   show the wrong button — never grant access.
   =================================================================== */

export interface PurchaseContextValue {
  purchases: Purchase[]
  /** Class ids with a confirmed ACTIVE purchase. */
  unlockedClasses: ClassId[]
  /** Status of the most recent checkout attempt, for result screens. */
  purchaseStatus: PurchaseStatus
  isLoading: boolean
  error: string | null
  isUnlocked: (classId: ClassId | undefined) => boolean
  hasAccessTo: (classId: ClassId | undefined) => boolean
  /** Opens a purchase request. Resolves to a PENDING record, never ACTIVE. */
  unlock: (classId: ClassId, streamId: StreamId | null) => Promise<Purchase | null>
  setStatus: (status: PurchaseStatus) => void
  refresh: () => Promise<void>
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null)

export function PurchaseProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [purchaseStatus, setPurchaseStatus] = useState<PurchaseStatus>('not_purchased')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // Signed out: no purchases, and nothing is requested.
    if (authStatus !== 'authenticated') {
      setPurchases([])
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setPurchases(await fetchPurchases())
    } catch (cause) {
      setPurchases([])
      setError(cause instanceof Error ? cause.message : 'Unable to load your purchases.')
    } finally {
      setIsLoading(false)
    }
  }, [authStatus])

  useEffect(() => {
    void load()
  }, [load])

  const unlockedClasses = useMemo(
    () =>
      purchases
        .filter((purchase) => purchase.status === 'success')
        .map((purchase) => purchase.classId),
    [purchases],
  )

  const isUnlocked = useCallback(
    (classId: ClassId | undefined) => (classId ? unlockedClasses.includes(classId) : false),
    [unlockedClasses],
  )

  const unlock = useCallback(async (classId: ClassId, streamId: StreamId | null) => {
    setPurchaseStatus('pending')
    try {
      // The server creates a PENDING request and returns it. The status below
      // is 'pending', not 'success' — payment has not been made or verified.
      const record = await createPurchase({ classId, streamId })
      setPurchases((prev: Purchase[]) => [...prev.filter((p) => p.classId !== classId), record])
      setPurchaseStatus(record.status === 'success' ? 'success' : 'pending')
      return record
    } catch (cause) {
      setPurchaseStatus('failed')
      setError(cause instanceof Error ? cause.message : 'Unable to start the purchase.')
      return null
    }
  }, [])

  const value = useMemo<PurchaseContextValue>(
    () => ({
      purchases,
      unlockedClasses,
      purchaseStatus,
      isLoading,
      error,
      isUnlocked,
      hasAccessTo: isUnlocked,
      unlock,
      setStatus: setPurchaseStatus,
      refresh: load,
    }),
    [purchases, unlockedClasses, purchaseStatus, isLoading, error, isUnlocked, unlock, load],
  )

  return <PurchaseContext value={value}>{children}</PurchaseContext>
}

export function usePurchase(): PurchaseContextValue {
  const context = use(PurchaseContext)
  if (!context) throw new Error('usePurchase must be used inside <PurchaseProvider>.')
  return context
}

export { isPurchaseActive }
