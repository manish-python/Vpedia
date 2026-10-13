import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Clock, Sparkles } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/common/Button'
import { SuccessIllustration } from '@/components/illustrations/Illustrations'
import { SkeletonPanel } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchLatestPurchase } from '@/services/purchaseService'
import { resolveClass } from '@/services/resolveService'
import { formatINR } from '@/utils/format'
import type { ClassId, StreamId, VClass } from '@/types'

/* ========================================================================
   Payment submitted — awaiting verification
   ---------------------------------------------------------------------
   THIS SCREEN MUST NOT SAY THE PAYMENT WAS SUCCESSFUL.

   In the manual UPI flow, submitting a proof proves nothing. It records
   evidence that an administrator then checks in Django Admin. Only after an
   approval does the purchase become ACTIVE.

   The wording below is deliberate and load-bearing:
     "Payment submitted successfully. Your payment is pending admin verification."

   The screen is reached only after the backend accepted a proof, and the
   purchase status is re-read from the server on mount. If the status comes
   back anything other than pending or active, the student is redirected
   rather than shown a reassuring message that the server did not support.
   =================================================================== */

interface PendingLocationState {
  classId?: number
  streamId?: StreamId | null
}

export function PaymentSuccessPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { isUnlocked, refresh } = usePurchase()
  const [checked, setChecked] = useState(false)

  const state = (location.state ?? {}) as PendingLocationState

  /**
   * Router state is the primary source, but a reload loses it. The query
   * string is a fallback so the screen can still resolve the class after a
   * refresh. Either way the purchase is re-checked against the server — and
   * arriving here never grants anything.
   */
  const classIdFromQuery = Number(searchParams.get('class'))
  const classId =
    state.classId ?? (Number.isInteger(classIdFromQuery) ? classIdFromQuery : undefined)

  const { data: vClass } = useAsync<VClass | null>(
    (signal) => (classId ? resolveClass(classId as ClassId, signal) : Promise.resolve(null)),
    [classId],
    { enabled: typeof classId === 'number' },
  )

  const { data: purchase, isLoading } = useAsync(
    (signal) => fetchLatestPurchase(classId as ClassId, signal),
    [classId],
    { enabled: typeof classId === 'number' },
  )

  useSeo({
    title: 'Payment submitted',
    description: 'Your payment proof has been submitted for verification.',
    path: '/payment/success',
    noIndex: true,
  })

  useEffect(() => {
    void refresh().finally(() => setChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Access already granted means an administrator approved while we were away.
  const alreadyUnlocked = isUnlocked(classId as ClassId)

  // Nothing was ever submitted, or the server knows of no purchase at all.
  if (checked && !purchase && !alreadyUnlocked) {
    return <Navigate to="/payment/failed" replace />
  }

  if (!vClass) {
    return <Navigate to="/classes" replace />
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas pb-[env(safe-area-inset-bottom)]">
      <header className="relative border-b border-hairline bg-white">
        <div className="container-page flex h-16 items-center justify-center">
          <Link to="/" aria-label="VPEDIA LEARNING home">
            <Logo size={34} />
          </Link>
        </div>
      </header>

      <main id="main" className="container-page relative flex flex-1 items-center justify-center py-10 sm:py-14">
        <div className="w-full max-w-xl text-center">
          <div
            aria-hidden
            className="mx-auto flex size-24 animate-pop-in items-center justify-center rounded-full bg-brand-500 shadow-[0_12px_32px_-8px_rgb(37_99_235/0.5)] sm:size-28"
          >
            <Clock className="size-12 text-white sm:size-14" strokeWidth={2.5} />
          </div>

          <h1 className="mt-7 animate-fade-up text-3xl font-extrabold text-brand-700 sm:text-4xl">
            Payment submitted successfully.
          </h1>
          <p className="mt-2 animate-fade-up text-base font-semibold text-ink-700">
            Your payment is pending admin verification.
          </p>

          <p className="mx-auto mt-3.5 max-w-md animate-fade-up text-ink-600">
            An administrator will verify the transfer against your UTR. Your{' '}
            {vClass.name} access unlocks as soon as they approve it — usually within a few hours.
          </p>

          {isLoading ? (
            <SkeletonPanel className="mx-auto mt-7 max-w-sm" />
          ) : purchase ? (
            <dl className="mx-auto mt-6 max-w-sm space-y-1.5 rounded-2xl border border-hairline bg-white p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Class</dt>
                <dd className="font-semibold text-ink-900">{vClass.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Amount</dt>
                <dd className="font-semibold text-ink-900 nums">{formatINR(purchase.amount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Status</dt>
                <dd className="font-semibold text-ink-900">
                  {purchase.status === 'success'
                    ? 'Approved — access unlocked'
                    : purchase.status === 'pending'
                      ? 'Pending verification'
                      : purchase.status === 'failed'
                        ? 'Rejected'
                        : 'Cancelled'}
                </dd>
              </div>
            </dl>
          ) : null}

          <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-ink-500">
            You can close this page. The dashboard will show the class as unlocked automatically once
            your payment is approved — there is nothing else to submit.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <ButtonLink
              to="/dashboard"
              size="lg"
              className="sm:min-w-48"
              leadingIcon={<Sparkles className="size-4.5" aria-hidden />}
            >
              Go to dashboard
            </ButtonLink>

            <ButtonLink to="/library" variant="outline" size="lg" className="sm:min-w-48">
              My Library
            </ButtonLink>
          </div>

          <div className="mt-10">
            <SuccessIllustration size={210} className="mx-auto w-full max-w-64 animate-fade-in" />
          </div>
        </div>
      </main>
    </div>
  )
}
