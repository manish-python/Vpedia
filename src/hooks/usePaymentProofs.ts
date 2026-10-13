import { useMemo } from 'react'

import { useAsync } from '@/hooks'
import { fetchMyPaymentProofs } from '@/services/paymentProofService'
import type { PaymentProof } from '@/types'

/* ========================================================================
   The student's payment proofs.
   ---------------------------------------------------------------------
   One fetch, shared by the dashboard, the purchase page, the payment page and
   the status page.

   This exists because of two false statements.

   First: opening the payment page creates a PENDING `ClassPurchase` — that is
   how the server prices the order and reserves the reference. Merely *looking*
   at the page therefore leaves a PENDING purchase behind, and the dashboard used
   to render that as "Payment verification pending - Your payment proof has been
   submitted and is waiting for administrator verification". Nothing had been
   submitted and nothing was being verified.

   Second, and worse: each caller then looked up proofs for that one purchase
   only. A class can hold several purchases — `create_purchase_request` refuses
   a new one only while one is PENDING or ACTIVE — so after a rejection the
   newest row had no proof and the student's real, rejected proof became
   invisible, reason and all.

   So this hook hands back the whole set and lets `resolveClassPayment` weigh it.
   It deliberately exposes no per-purchase convenience lookup, because that is
   the shape that caused the second bug.
   =================================================================== */

export interface PaymentProofsResult {
  /** Every proof the student has submitted, newest first. */
  all: readonly PaymentProof[]
  isLoading: boolean
  /** True when the request failed. Absence of a proof is never inferred from an error. */
  failed: boolean
}

export function usePaymentProofs(): PaymentProofsResult {
  const { data, isLoading, error } = useAsync<PaymentProof[]>(
    (signal) => fetchMyPaymentProofs(signal),
    [],
  )

  const all = useMemo<readonly PaymentProof[]>(() => {
    const rows = data ?? []
    // Newest first, decided by the server's own timestamp rather than by
    // whatever order the endpoint serialised in.
    return [...rows].sort((a, b) => {
      const left = Date.parse(a.submittedAt ?? '') || 0
      const right = Date.parse(b.submittedAt ?? '') || 0
      return right - left
    })
  }, [data])

  return { all, isLoading, failed: error != null }
}
