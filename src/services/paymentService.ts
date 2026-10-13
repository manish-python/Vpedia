import type { ClassId, PaymentProof, StreamId, UPIConfig, UPIContext } from '@/types'
import type { PaymentProofDto, UPISettingsDto, UPIContextDto } from '@/types/api'
import { get, getList, postForm } from './client'
import { toPaymentProof, toUPIConfig, toUPIContext } from './mappers'

/* ========================================================================
   Payment service — manual UPI

   There is NO payment gateway here. No Razorpay, no Stripe, no checkout SDK,
   no order endpoint, no client-side signature. The previous gateway seam has
   been removed entirely; nothing in this repository imports one.

   The flow, in full:

     1. GET  /purchases/{id}/upi/     → UPI ID, QR, amount, reference, upi:// URI
     2. Student pays in their OWN UPI application        ← outside this app
     3. POST /payments/proofs/        → screenshot + UTR, recorded as PENDING
     4. An administrator verifies the transfer in Django Admin
     5. Only then does the purchase become ACTIVE

   Step 2 proves nothing and this service never claims it does. Opening the
   `upi://` URI only launches an application; it is not a payment receipt.
   Nothing returns "success" until the server reports an APPROVED proof.
   =================================================================== */

/* ---------------------------------------------------------------------
   Configuration — always from the backend
   ------------------------------------------------------------------ */

/**
 * GET /api/v1/payments/upi/ — the live UPI configuration.
 *
 * Read from Django on every use, so an administrator changing the UPI ID or
 * QR in Django Admin changes what students see, with no redeploy and no
 * frontend edit. Nothing is hardcoded and nothing is cached across a sign-in.
 */
export async function fetchUPISettings(signal?: AbortSignal): Promise<UPIConfig | null> {
  try {
    const dto = await get<UPISettingsDto>('/payments/upi/', signal)
    return toUPIConfig(dto)
  } catch {
    return null
  }
}

/**
 * GET /api/v1/purchases/{id}/upi/ — everything needed to collect this payment.
 *
 * The amount and the `upi://` URI are built by the server from the purchase,
 * so the figures a student pays are the figures the server recorded.
 */
export async function fetchUPIContext(
  purchaseId: string | number,
  signal?: AbortSignal,
): Promise<UPIContext | null> {
  try {
    const dto = await get<UPIContextDto>(`/purchases/${purchaseId}/upi/`, signal)
    return toUPIContext(dto)
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------------
   Proof submission
   ------------------------------------------------------------------ */

export interface PaymentProofInput {
  purchaseId: number
  utr: string
  transactionId?: string
  screenshot: File
}

/**
 * POST /api/v1/payments/proofs/ — submit evidence of a UPI transfer.
 *
 * The amount is deliberately absent. `PaymentProofSubmissionSerializer` has
 * no amount field: the server copies it from the purchase, so a client that
 * tries to post its own figure is rejected rather than believed.
 *
 * Returns the created proof, which is always PENDING.
 */
export async function submitPaymentProof(
  input: PaymentProofInput,
  signal?: AbortSignal,
): Promise<PaymentProof> {
  if (!input.utr.trim()) {
    throw new Error('Enter the UTR or transaction reference from your UPI app.')
  }
  if (!input.screenshot) {
    throw new Error('Attach a screenshot of the completed payment.')
  }

  const form = new FormData()
  form.append('class_purchase', String(input.purchaseId))
  form.append('utr', input.utr.trim())
  if (input.transactionId?.trim()) {
    form.append('transaction_id', input.transactionId.trim())
  }
  // The file is sent as-is. The server decodes it with Pillow and rejects
  // anything that is not a real image, so the client is not trusted to have
  // checked the type or the size.
  form.append('screenshot', input.screenshot)

  const dto = await postForm<PaymentProofDto>('/payments/proofs/', form, signal)
  return toPaymentProof(dto)
}

/** GET /api/v1/payments/my/ — the caller's own proofs. */
export async function fetchMyPaymentProofs(signal?: AbortSignal): Promise<PaymentProof[]> {
  const dtos = await getList<PaymentProofDto>('/payments/my/', signal)
  return dtos.map(toPaymentProof)
}

/** Proofs for a single purchase, newest first. */
export async function fetchProofsForPurchase(
  purchaseId: string | number,
  signal?: AbortSignal,
): Promise<PaymentProof[]> {
  const proofs = await fetchMyPaymentProofs(signal)
  return proofs.filter((proof) => proof.purchaseId === String(purchaseId))
}

/* ---------------------------------------------------------------------
   UPI deep link
   ------------------------------------------------------------------ */

/**
 * Opens the student's own UPI application.
 *
 * Returns `false` when no UPI app is registered, so the caller can fall back
 * to "copy the UPI ID" rather than leaving a dead button.
 *
 * IMPORTANT: a successful return from this function means an application
 * opened. It says nothing about whether money moved.
 */
export function openUpiApp(uri: string): boolean {
  if (!uri) return false
  if (typeof window === 'undefined') return false

  try {
    window.location.href = uri
    return true
  } catch {
    return false
  }
}

/** Best-effort copy to clipboard, for the "copy UPI ID" affordance. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Clipboard access can be denied; the caller shows the value instead.
  }
  return false
}

/** ₹ formatting for the amount the server sent as a decimal string. */
export function formatAmount(amount: string | number, currency = 'INR'): string {
  const value = typeof amount === 'number' ? amount : Number.parseFloat(amount)
  const safe = Number.isFinite(value) ? value : 0
  const symbol = currency === 'INR' ? '₹' : `${currency} `
  return `${symbol}${Math.round(safe).toLocaleString('en-IN')}`
}

/** Convenience for the purchase flow: which class a proof settles. */
export function purchaseKeyFor(classId: ClassId, streamId: StreamId | null): string {
  return streamId ? `${classId}:${streamId}` : String(classId)
}
