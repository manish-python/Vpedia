import { useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { Button, ButtonLink } from '@/components/common/Button'
import { Checklist } from '@/components/cards/FeatureCard'
import { PaymentSummary } from '@/components/payment/PaymentSummary'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonPanel } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { PurchaseStatusBadge } from '@/components/purchase/PurchaseStatusCard'
import { useToast } from '@/context/ToastContext'
import { usePaymentProofs } from '@/hooks/usePaymentProofs'
import { formatINR } from '@/utils/format'
import { fetchStreams } from '@/services/classService'
import { resolveClass } from '@/services/resolveService'
import type { ClassId, StreamId, VClass } from '@/types'
import type { ClassPaymentState } from '@/utils/classPaymentState'
import { resolveClassPayment } from '@/utils/classPaymentState'

/* ========================================================================
   Purchase
   ---------------------------------------------------------------------
   Confirms what is being bought and hands off to the payment route, where
   the purchase request is actually created.

   This page never unlocks anything, and never shows a price it computed.
   The amount is `vClass.price`, which came from `GET /classes/`.
   =================================================================== */

const INCLUDED = [
  'All subjects',
  'All chapters',
  'Notes',
  'PYQs',
  'Solved PYQs',
  'Important Questions',
  'Practice Papers',
  'Model Papers',
]

interface LocationState {
  streamId?: StreamId
}

export function PurchasePage() {
  const { classId: classIdParam } = useParams<{ classId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useAuth()
  const { isUnlocked, purchases } = usePurchase()
  const { all: proofs } = usePaymentProofs()
  const { push } = useToast()

  const classId = Number(classIdParam)

  /**
   * What is actually happening with this class, according to the server.
   *
   * Computed from *every* purchase and *every* proof the student holds, not from
   * the newest purchase row. A class can hold more than one row —
   * `create_purchase_request` refuses a new one only while one is PENDING or
   * ACTIVE — so keying on the newest row hid a real, rejected proof (and its
   * reason) behind any later checkout.
   *
   * Derived after `classId` exists: referencing it earlier is a temporal-dead-
   * zone error that blanks the whole page.
   */
  const view = useMemo(
    () => resolveClassPayment(classId as ClassId, purchases, proofs),
    [classId, purchases, proofs],
  )
  const existingPurchase = view.purchase
  const state = (location.state ?? {}) as LocationState
  const streamId = state.streamId ?? null

  // Class and stream both come from the catalogue the backend serves.
  const { data: vClass, isLoading } = useAsync<VClass | null>(
    (signal) => resolveClass(classId, signal),
    [classId],
    { enabled: Number.isFinite(classId) },
  )

  const { data: streams } = useAsync((signal) => fetchStreams(classId, signal), [classId], {
    enabled: Number.isFinite(classId),
  })
  const stream = streams?.find((s) => s.id === streamId) ?? null

  const [preparing, setPreparing] = useState(false)

  useSeo({
    title: vClass ? `Purchase ${vClass.name}` : 'Purchase',
    description: `One-time payment for complete access to ${vClass?.name ?? 'your class'}.`,
    path: `/purchase/${classId}`,
    noIndex: true,
  })

  // Signing in is required before money changes hands.
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: `/purchase/${classId}` }} />
  }

  // An ACTIVE purchase never needs the checkout again.
  if (isUnlocked(classId as ClassId)) {
    return <Navigate to={`/classes/${classId}/subjects`} replace />
  }

  if (isLoading) {
    return (
      <div className="container-page space-y-5 py-10">
        <SkeletonPanel className="h-8 w-56" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <SkeletonPanel className="h-96" />
          <SkeletonPanel className="h-80" />
        </div>
      </div>
    )
  }

  if (!vClass) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Class not found"
          description="This class is not available."
          action={{ label: 'Choose a class', to: '/classes' }}
        />
      </div>
    )
  }

  // Classes with streams must have one chosen before a purchase can exist.
  if (vClass.hasStreams && !streamId) {
    return <Navigate to={`/classes/${classId}`} replace />
  }

  const proceed = () => {
    setPreparing(true)
    // The purchase request itself is created by the server on the payment
    // screen, where the exact amount and reference are known.
    navigate('/payment', { state: { classId: vClass.id, streamId } })
    push({
      tone: 'info',
      title: 'Opening payment',
      description: 'Pay over UPI, then submit your payment proof.',
    })
  }

  return (
    <div className="pb-16">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-6">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: 'Classes', to: '/classes' },
              { label: vClass.name, to: `/classes/${vClass.id}` },
              { label: 'Purchase' },
            ]}
          />
        </div>
      </div>

      <div className="container-page grid gap-8 py-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12 lg:py-12">
        <div>
          <button
            type="button"
            onClick={() => navigate(`/classes/${vClass.id}`)}
            className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-semibold text-ink-600 transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to {vClass.name}
          </button>

          <h1 className="mt-5 text-3xl sm:text-4xl">
            {vClass.name} Complete Access
          </h1>
          {stream ? (
            <p className="mt-1.5 text-ink-500">
              Stream: <span className="font-semibold text-grape-600">{stream.name}</span>
            </p>
          ) : null}

          <div className="mt-6 rounded-2xl border border-hairline bg-white p-5 shadow-card sm:p-6">
            <p className="text-3xl font-extrabold text-sun-600 nums">
              {formatINR(vClass.price)}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-700">One Time Payment</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Pay once and keep access to everything in {vClass.name}. No subscription, no renewal,
              and no extra charge when new material is added.
            </p>
          </div>

          <section aria-labelledby="included" className="mt-8">
            <h2 id="included" className="text-xl">
              What you get
            </h2>
            <Checklist items={INCLUDED} className="mt-4" />
          </section>

          <div className="mt-8 flex items-start gap-2.5 rounded-xl bg-ink-50 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-leaf-600" aria-hidden />
            <p className="text-sm leading-relaxed text-ink-600">
              Payment is collected over UPI, outside this website. VPEDIA LEARNING never sees or
              stores your card or UPI credentials, and access is granted only after an
              administrator verifies your transfer.
            </p>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <PaymentSummary vClass={vClass} stream={stream} />

          {/*
            Only an evidence-backed state may hide the checkout button.

            `pending` means a proof is with an administrator: showing "Proceed to
            Payment" there would invite a second payment for a purchase that is
            already being reviewed. Every other state keeps a way forward —
            including `incomplete`, which previously rendered a badge and no
            button at all.
          */}
          {view.state === 'pending' && existingPurchase ? (
            <>
              <PurchaseStatusBadge
                tone="sun"
                title="Payment under verification"
                className="mt-5"
              />
              <p className="mt-2.5 text-center text-xs leading-relaxed text-ink-500">
                Your payment proof has already been submitted. Status: PENDING.
                Access opens as soon as an administrator approves it — no second
                payment is needed.
              </p>
              <ButtonLink
                to={`/payment/status/${existingPurchase.id}`}
                size="lg"
                fullWidth
                className="mt-4"
              >
                View Payment Status
              </ButtonLink>
            </>
          ) : (
            <>
              {view.state === 'rejected' ? (
                <>
                  <PurchaseStatusBadge
                    tone="rose"
                    title={view.rejectionReason ? 'Payment rejected' : 'Previous payment was not verified'}
                    className="mt-5"
                  />
                  {view.rejectionReason ? (
                    <p className="mt-2.5 rounded-xl bg-rose-50 p-3 text-center text-xs leading-relaxed text-ink-600">
                      <span className="font-bold">Reason: </span>
                      {view.rejectionReason}
                    </p>
                  ) : null}
                </>
              ) : null}
              <Button
                size="lg"
                fullWidth
                className="mt-5"
                loading={preparing}
                trailingIcon={<ArrowRight className="size-5" aria-hidden />}
                onClick={proceed}
              >
                {ctaForPurchaseState(view.state)}
              </Button>
            </>
          )}

          <p className="mt-3 text-center text-xs leading-relaxed text-ink-500">
            By continuing you agree to the{' '}
            <Link to="/faq" className="font-semibold text-brand-700 underline">
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </aside>
      </div>
    </div>
  )
}

/**
 * What the checkout button invites the student to do.
 *
 * `incomplete` gets its own label because that state is reached by following
 * "Continue Payment" from the dashboard; calling it "Proceed to Payment" there
 * would read as a second purchase.
 */
function ctaForPurchaseState(state: ClassPaymentState): string {
  switch (state) {
    case 'incomplete':
      return 'Continue Payment'
    case 'rejected':
      return 'Submit New Payment Proof'
    default:
      return 'Proceed to Payment'
  }
}
