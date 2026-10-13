import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react'

import { PageHeading } from '@/layouts/AppLayout'
import { Button, ButtonLink } from '@/components/common/Button'
import { ErrorState } from '@/components/common/EmptyState'
import { Loader } from '@/components/common/Spinner'
import { useSeo } from '@/hooks'
import { fetchMyPaymentProofs } from '@/services/paymentProofService'
import { fetchPurchases } from '@/services/purchaseService'
import { formatINR, formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { PaymentProof, Purchase } from '@/types'

/* ========================================================================
   Payment Status — /payment/status/:purchaseId

   One page, three honest states, driven entirely by the server:

     PENDING  -> proof recorded, awaiting verification, class still locked
     APPROVED -> access active, class opens
     REJECTED -> refused, with the administrator's reason, retry available

   There is deliberately no "submitted means paid" reading. A proof records
   evidence; only an APPROVED proof (and an ACTIVE purchase) means anything.

   While a payment is PENDING this page polls the backend, because the thing
   that can change it is an administrator clicking Approve in another window.
   Polling stops the moment the state settles, and stops on unmount.
   =================================================================== */

const POLL_MS = 15_000

export function PaymentStatusPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()
  const navigate = useNavigate()

  const [proof, setProof] = useState<PaymentProof | null>(null)
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useSeo({
    title: 'Payment Status',
    description: 'Track the verification of your VPEDIA LEARNING payment.',
    path: '/payment/status',
    noIndex: true,
  })

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!purchaseId) return
      try {
        // The route carries a *purchase* id, but the UTR and the verification
        // timeline live on the payment *proof*. Proofs are a separate resource
        // with their own ids, so the list is filtered down to the ones that
        // settle this purchase and the newest is taken.
        //
        // Using the purchase id as a proof id silently found nothing and left
        // UTR and dates blank, which read as "no proof submitted".
        const [purchases, proofs] = await Promise.all([
          fetchPurchases(signal),
          fetchMyPaymentProofs(signal),
        ])
        setPurchase(purchases.find((row) => row.id === purchaseId) ?? null)
        setProof(proofs.find((row) => row.purchaseId === purchaseId) ?? null)
        setError(null)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Could not load payment status.')
      } finally {
        setLoading(false)
      }
    },
    [purchaseId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  // Only poll while an administrator decision is outstanding.
  const settled = proof?.status === 'approved' || proof?.status === 'rejected'
  const purchaseSettled = purchase?.status === 'success'

  useEffect(() => {
    if (settled || purchaseSettled) return
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [settled, purchaseSettled, load])

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeading title="Payment Status" />
        <div className="flex justify-center py-16">
          <Loader label="Loading payment status…" />
        </div>
      </div>
    )
  }

  if (error || (!proof && !purchase)) {
    return (
      <div className="space-y-6">
        <PageHeading title="Payment Status" />
        <ErrorState
          title="Unable to load payment status"
          message={error ?? 'We could not find this payment.'}
          onRetry={() => void load()}
        />
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    )
  }

  const approved = proof?.status === 'approved' || purchase?.status === 'success'
  const rejected = proof?.status === 'rejected' || purchase?.status === 'failed'
  // A PENDING purchase with no proof is an abandoned checkout, not a payment
  // awaiting verification. Say which one this is.
  const awaitingProof = !approved && !rejected && !proof

  const classNumber = purchase ? Number(purchase.classId) : null
  // A proof names the class; without one, fall back to the purchase's class
  // number rather than rendering a raw id.
  const classLabel = proof?.className ?? (classNumber !== null ? `Class ${classNumber}` : '—')

  return (
    <div className="space-y-6">
      <PageHeading
        title="Payment Status"
        subtitle="Verification is done by a human administrator, not automatically."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            leadingIcon={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
        }
      />

      <div className="mx-auto max-w-2xl space-y-5">
        <StatusBanner
          approved={approved}
          rejected={rejected}
          awaitingProof={awaitingProof}
        />

        <section className="rounded-2xl border border-hairline bg-white p-5 shadow-card">
          <h2 className="text-base font-bold text-ink-900">Payment details</h2>

          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Class" value={classLabel} />
            <Row
              label="Amount"
              value={formatINR(proof?.amount ?? purchase?.amount ?? 0)}
            />
            <Row
              label="Status"
              value={proof?.statusLabel ?? (approved ? 'Approved' : 'Pending')}
            />
            <Row label="UTR" value={proof?.utr || 'Not submitted'} />
            <Row
              label="Transaction ID"
              value={proof?.transactionId || 'Not provided'}
            />
            <Row
              label="Submitted"
              value={proof ? formatDateTime(proof.submittedAt) : 'No proof submitted'}
            />
            {proof?.reviewedAt ? (
              <Row label="Reviewed" value={formatDateTime(proof.reviewedAt)} />
            ) : null}
            {rejected && proof?.rejectionReason ? (
              <div className="rounded-xl bg-rose-50 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-rose-700">
                  Reason for rejection
                </dt>
                <dd className="mt-1 break-words text-sm text-ink-800">
                  {proof.rejectionReason}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {approved && classNumber !== null ? (
          <div className="rounded-2xl border border-leaf-200 bg-leaf-50 p-5">
            <p className="font-bold text-ink-900">Your payment has been verified.</p>
            <p className="mt-1 text-sm text-ink-600">
              {proof?.className} Complete Access is active.
            </p>
            <ButtonLink to={`/classes/${classNumber}/subjects`} size="lg" className="mt-4" fullWidth>
              Open Class
            </ButtonLink>
          </div>
        ) : null}

        {rejected && classNumber !== null ? (
          <ButtonLink to={`/purchase/${classNumber}`} size="lg" fullWidth variant="primary">
            Submit New Payment Proof
          </ButtonLink>
        ) : null}

        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="w-full">
          <ArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Button>
      </div>
    </div>
  )
}

function StatusBanner({
  approved,
  rejected,
  awaitingProof,
}: {
  approved: boolean
  rejected: boolean
  awaitingProof: boolean
}) {
  if (approved) {
    return (
      <Banner
        tone="leaf"
        Icon={CheckCircle2}
        title="Payment Accepted"
        body="Your access is active. You can open the class now."
      />
    )
  }
  if (rejected) {
    return (
      <Banner
        tone="rose"
        Icon={XCircle}
        title="Payment Rejected"
        body="The class is still locked. Check the reason below and submit a fresh proof."
      />
    )
  }
  if (awaitingProof) {
    return (
      <Banner
        tone="sun"
        Icon={Clock}
        title="Payment not completed"
        body="No payment proof has been submitted for this purchase, so there is nothing to verify yet. Complete the payment and attach your proof."
      />
    )
  }
  return (
    <Banner
      tone="sun"
      Icon={Clock}
      title="Payment verification pending"
      body="Your proof has been recorded and is waiting for an administrator. Access is not granted until then."
      pulse
    />
  )
}

function Banner({
  tone,
  Icon,
  title,
  body,
  pulse,
}: {
  tone: 'leaf' | 'rose' | 'sun'
  Icon: typeof Clock
  title: string
  body: string
  pulse?: boolean
}) {
  const styles = {
    leaf: 'border-leaf-200 bg-leaf-50 text-leaf-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    sun: 'border-sun-200 bg-sun-50 text-sun-700',
  } as const

  return (
    <div
      role="status"
      className={cn('flex gap-3 rounded-2xl border p-5', styles[tone])}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm"
      >
        <Icon className={cn('size-5', pulse && 'animate-pulse')} />
      </span>
      <div className="min-w-0">
        {/* Text label as well as colour and icon, so state is never colour-only. */}
        <p className="font-bold text-ink-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 pb-2.5 last:border-0">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-ink-800">{value}</dd>
    </div>
  )
}
