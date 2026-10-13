/* ========================================================================
   Student payment proofs — read model for the status screens.

   `GET /api/v1/payments/proofs/` returns only the signed-in student's own
   proofs: the viewset filters by owner for non-staff, and every detail route
   runs an ownership check, so no id from another student is ever readable.

   These mirror `PaymentProofSerializer`, which deliberately omits the
   screenshot URL — payment evidence is private and the image is staff-only.
   ===================================================================== */

import { get, getList } from '@/services/client'
import type { PaymentProofDto } from '@/types/api'
import type { PaymentProof, ProofStatus } from '@/types'

/**
 * The student's proofs, newest first.
 *
 * An empty array means "no proof submitted yet", which is a normal state rather
 * than an error. A failed request throws, so a caller can show a real error
 * instead of implying nothing was ever submitted.
 */
export async function fetchMyPaymentProofs(signal?: AbortSignal): Promise<PaymentProof[]> {
  const rows = await getList<PaymentProofDto>('/payments/proofs/', signal)
  return rows.map(toPaymentProof)
}

/** One proof, for the status page. Null when it is not this student's. */
export async function fetchPaymentProof(
  id: string | number,
  signal?: AbortSignal,
): Promise<PaymentProof | null> {
  try {
    const dto = await get<PaymentProofDto>(`/payments/proofs/${id}/detail/`, signal)
    return toPaymentProof(dto)
  } catch {
    return null
  }
}

function toPaymentProof(dto: PaymentProofDto): PaymentProof {
  return {
    id: String(dto.id),
    purchaseId: String(dto.class_purchase),
    className: dto.class_name,
    amount: Number(dto.amount),
    currency: 'INR',
    utr: dto.utr,
    transactionId: dto.transaction_id,
    status: toProofStatus(dto.status),
    statusLabel: dto.status_label,
    submittedAt: dto.submitted_at,
    reviewedAt: dto.reviewed_at,
    reviewedByEmail: dto.reviewed_by_email,
    rejectionReason: dto.rejection_reason,
  }
}

/**
 * The server's vocabulary, unchanged.
 *
 * There is deliberately no `submitted` state. Submitting a proof records
 * evidence against a purchase that is *already* PENDING; it does not advance
 * anything. Showing "submitted" as though it were progress towards approval is
 * exactly what makes a student believe they are closer to access than they are.
 */
function toProofStatus(status: string): ProofStatus {
  switch (status.toUpperCase()) {
    case 'APPROVED':
      return 'approved'
    case 'REJECTED':
      return 'rejected'
    default:
      return 'pending'
  }
}