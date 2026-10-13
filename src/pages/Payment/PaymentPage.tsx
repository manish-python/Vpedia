import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, QrCode, ShieldCheck } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { Button, ButtonLink } from '@/components/common/Button'
import { PaymentStatus } from '@/components/payment/PaymentStatus'
import { ErrorState } from '@/components/common/EmptyState'
import { Loader } from '@/components/common/Spinner'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { formatINR } from '@/utils/format'
import { fetchUPIContext, formatAmount, openUpiApp, submitPaymentProof } from '@/services/paymentService'
import { resolveClass } from '@/services/resolveService'
import { usePaymentProofs } from '@/hooks/usePaymentProofs'
import { hasPendingProofFor } from '@/utils/classPaymentState'
import { canSubmitProof, screenshotProblem } from '@/utils/screenshot'
import type { ClassId, StreamId, UPIContext } from '@/types'

/* ========================================================================
   Payment — manual UPI
   ---------------------------------------------------------------------
   There is no gateway, no order and no client-side confirmation.

   The flow on this screen:
     1. Create the purchase request  → the server prices it and returns PENDING
     2. Read the UPI details         → ID, QR, amount, reference, `upi://` URI
     3. The student pays in THEIR OWN UPI app
     4. They come back and submit the screenshot + UTR
     5. An administrator verifies it

   Step 3 leaves this app entirely and returns nothing. Opening the deep
   link proves only that an application launched, so the UI says so plainly
   and never advances past "pending" on its own.

   The amount shown is whatever the server returned. It is not computed here
   and could not be overridden by anything typed into this page.
   =================================================================== */

interface PaymentLocationState {
  classId?: number
  streamId?: StreamId | null
}

type Stage = 'preparing' | 'ready' | 'submitting' | 'submitted' | 'error'

export function PaymentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status } = useAuth()
  const { unlock, refresh } = usePurchase()
  const fileInput = useRef<HTMLInputElement>(null)

  const state = (location.state ?? {}) as PaymentLocationState
  const classId = state.classId
  const streamId = state.streamId ?? null

  const [stage, setStage] = useState<Stage>('preparing')
  const [error, setError] = useState<string | null>(null)
  const [purchaseId, setPurchaseId] = useState<number | null>(null)
  const [utr, setUtr] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  /**
   * Whether this purchase already has a proof awaiting review.
   *
   * Read from the server, never from local state. A `File` sitting in
   * `screenshot` is only a browser-local handle on some bytes: it exists in
   * memory until the API accepts it, so it says nothing about what has been
   * submitted and must never be used as if it did.
   */
  const { all: proofs } = usePaymentProofs()
  const proofAlreadyPending = hasPendingProofFor(
    purchaseId === null ? null : String(purchaseId),
    proofs,
  )

  /**
   * Whether the chosen screenshot would survive the server's own check.
   *
   * A mirror of `validate_image_upload`, used to disable the button up front
   * rather than to decide anything. The server's verdict still wins.
   */
  const screenshotIssue = screenshotProblem(screenshot)

  /** Missing screenshot and UTR are reported here, not as a failed submission. */
  const missingEvidence = !screenshot
    ? 'Attach a screenshot of the completed payment.'
    : (screenshotIssue ??
      (utr.trim() ? null : 'Enter the UTR or transaction reference from your UPI app.'))

  const readyToSubmit =
    purchaseId !== null && !error && !proofAlreadyPending && canSubmitProof(screenshot, utr)

  // The class comes from the catalogue the backend serves.
  const resolvedClass = useAsync(
    (signal) => (classId ? resolveClass(classId as ClassId, signal) : Promise.resolve(null)),
    [classId],
    { enabled: Boolean(classId) },
  )
  const vClass = resolvedClass.data

  // UPI details are read AFTER a purchase exists, because the reference and
  // amount belong to that purchase.
  const upi = useAsync<UPIContext | null>(
    (signal) => (purchaseId ? fetchUPIContext(purchaseId, signal) : Promise.resolve(null)),
    [purchaseId],
    { enabled: purchaseId !== null },
  )

  const upiContext = upi.data

  // NOTE: body scrolling is deliberately NOT locked on this page.
  //
  // The payment card is taller than a short laptop viewport, and Step 2 plus the
  // submit button sit below the fold. Locking `body` — which this page used to
  // do unconditionally — made everything below the QR unreachable: the user
  // could not scroll to it and had to zoom out to reach it. The page is a normal
  // scrolling document instead.
  //
  // `useLockBodyScroll` belongs to modals and drawers, which have nothing below
  // them to reveal.
  useSeo({
    title: 'Complete Payment',
    description: 'Pay for your VPEDIA LEARNING class over UPI.',
    path: '/payment',
    noIndex: true,
  })

  // Open the purchase request as soon as the class is known. Idempotent in
  // effect: a second request for the same class returns 409, which is
  // handled by the existing purchase rather than shown as an error.
  useAsync<void>(
    async () => {
      if (!vClass) return
      try {
        const record = await unlock(vClass.id, streamId)
        setPurchaseId(Number(record?.id))
        setStage('ready')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to start the payment.')
        setStage('error')
      }
    },
    [vClass?.id],
    { enabled: Boolean(vClass) && purchaseId === null && stage === 'preparing' },
  )

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: '/purchase' }} />
  }

  if (classId === undefined) {
    return <Navigate to="/classes" replace />
  }

  if (resolvedClass.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Loader label="Preparing payment…" />
      </div>
    )
  }

  if (!vClass) {
    return <Navigate to="/classes" replace />
  }

  const submit = async () => {
    if (!purchaseId) return
    if (!canSubmitProof(screenshot, utr)) {
      setFieldError(missingEvidence ?? 'Add your payment proof to continue.')
      return
    }

    setFieldError(null)
    setStage('submitting')

    try {
      await submitPaymentProof({ purchaseId, utr, transactionId, screenshot })
      setStage('submitted')
      // Purchase state changed on the server; re-read it so the library and
      // dashboard stop showing the old answer.
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit your payment proof.')
      setStage('error')
    }
  }

  const submitted = stage === 'submitted'

  return (
    // `min-h-dvh`, never `h-dvh`: the card is allowed to grow past the viewport
    // and the document scrolls. The extra bottom padding keeps the submit button
    // and the verification line clear of mobile browser chrome and the home
    // indicator, where `env()` resolves to 0 on desktop.
    <div className="min-h-dvh bg-canvas pb-[env(safe-area-inset-bottom)]">
      <header className="border-b border-hairline bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate(`/purchase/${vClass.id}`, { state: streamId ? { streamId } : undefined })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </button>

          {/* Visible at every width. At 360px the three header items total
              roughly 244px, so the brand fits without crowding the title. */}
          <Link to="/" aria-label="VPEDIA LEARNING home" className="shrink-0">
            <Logo size={30} variant="inline" />
          </Link>

          <p className="shrink-0 whitespace-nowrap text-xs font-bold text-ink-800 sm:text-sm">
            Complete Payment
          </p>
        </div>
      </header>

      <main id="main" className="container-page py-6 sm:py-10">
        {/* 32rem = 512px: inside the 480-560px target band, and `w-full`
            guarantees it shrinks rather than overflowing a narrow screen. */}
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-3xl border border-hairline bg-white p-4 shadow-panel sm:p-6 lg:p-8">
            <div className="flex justify-center">
              <Logo size={40} />
            </div>

            <p className="mt-6 text-center text-sm font-medium text-ink-500">{vClass.name}</p>
            <p className="mt-1 text-center text-base font-bold text-ink-900">
              {vClass.name} Complete Access
            </p>

            {/* Amount comes from the server's UPI context, falling back to the
                class price the catalogue served. Never computed here. */}
            <p className="mt-4 text-center text-4xl font-extrabold text-sun-600 nums">
              {upiContext ? formatAmount(upiContext.amount, upiContext.currency) : formatINR(vClass.price)}
            </p>

            {submitted ? (
              <div className="mt-7">
                <PaymentStatus
                  state="success"
                  message="Payment submitted successfully. Your payment is pending admin verification."
                />
                <p className="mt-4 text-center text-sm text-ink-500">
                  We will confirm your payment shortly. Access unlocks only after an
                  administrator verifies it — you will see the class unlock on your
                  dashboard.
                </p>
                {/* Submitted is not approved. The status page is where that
                    distinction is actually explained and kept up to date. */}
                {purchaseId !== null ? (
                  <ButtonLink
                    to={`/payment/status/${purchaseId}`}
                    size="lg"
                    fullWidth
                    className="mt-6"
                  >
                    View Payment Status
                  </ButtonLink>
                ) : null}
                <Button
                  size="lg"
                  fullWidth
                  variant={purchaseId !== null ? 'ghost' : 'primary'}
                  className={purchaseId !== null ? '' : 'mt-6'}
                  onClick={() => navigate('/dashboard', { replace: true })}
                >
                  Go to dashboard
                </Button>
              </div>
            ) : (
              <>
                {/* ---- Step 1: pay over UPI ---- */}
                <section className="mt-7">
                  <h2 className="text-center text-sm font-bold text-ink-800">
                    Step 1 — Pay with any UPI app
                  </h2>

                  {upi.isLoading ? (
                    <div className="mt-4 flex justify-center">
                      <Loader label="Loading UPI details…" />
                    </div>
                  ) : upiContext ? (
                    <div className="mt-4 rounded-2xl border border-hairline bg-ink-50 p-5">
                      <QrBlock
                        src={upiContext.qrCodeUrl}
                        onRetry={upi.refetch}
                      />

                      {/* `min-w-0` lets each value shrink inside the flex row
                          and `break-words`/`break-all` wraps a long UPI ID or
                          display name rather than widening the page. */}
                      <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-ink-500">UPI ID</dt>
                          <dd className="min-w-0 break-all text-right font-semibold text-ink-900">
                            {upiContext.upiId}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-ink-500">Pay to</dt>
                          <dd className="min-w-0 break-words text-right font-semibold text-ink-900">
                            {upiContext.displayName}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-ink-500">Reference</dt>
                          <dd className="nums min-w-0 break-all text-right font-semibold text-ink-900">
                            {upiContext.reference}
                          </dd>
                        </div>
                      </dl>

                      {upiContext.upiUri ? (
                        <Button
                          size="md"
                          fullWidth
                          className="mt-4"
                          onClick={() => openUpiApp(upiContext.upiUri)}
                        >
                          Open UPI app
                        </Button>
                      ) : null}

                      <p className="mt-3 text-center text-xs leading-relaxed text-ink-500">
                        Opening your UPI app does not confirm payment. Pay the exact
                        amount, then come back and submit your proof below.
                      </p>
                    </div>
                  ) : (
                    <ErrorState
                      title="UPI details unavailable"
                      message="Payment details could not be loaded. Please try again in a moment."
                      onRetry={upi.refetch}
                    />
                  )}
                </section>

                {/* ---- Step 2: submit proof ---- */}
                <section className="mt-7 border-t border-hairline pt-6">
                  <h2 className="text-center text-sm font-bold text-ink-800">
                    Step 2 — Submit your payment proof
                  </h2>

                  <div className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="utr" className="block text-xs font-semibold text-ink-600">
                        UTR / transaction reference
                      </label>
                      <input
                        id="utr"
                        value={utr}
                        onChange={(e) => setUtr(e.target.value)}
                        placeholder="e.g. 412345678901"
                        autoComplete="off"
                        inputMode="numeric"
                        maxLength={64}
                        className="mt-1 w-full min-w-0 rounded-xl border border-hairline px-3 py-2.5 text-sm outline-none transition focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="txn" className="block text-xs font-semibold text-ink-600">
                        Transaction ID <span className="font-normal text-ink-400">(optional)</span>
                      </label>
                      <input
                        id="txn"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        className="mt-1 w-full min-w-0 rounded-xl border border-hairline px-3 py-2.5 text-sm outline-none transition focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="shot" className="block text-xs font-semibold text-ink-600">
                        Payment screenshot
                      </label>
                      <input
                        id="shot"
                        ref={fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          setScreenshot(e.target.files?.[0] ?? null)
                          setFieldError(null)
                        }}
                        className="mt-1 block w-full min-w-0 max-w-full rounded-xl text-xs text-ink-600 outline-none focus-visible:ring-2 focus-visible:ring-brand-100 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2.5 file:text-xs file:font-semibold"
                      />
                      <p className="mt-1 text-xs text-ink-400">
                        JPG, PNG or WebP, up to 5 MB.
                      </p>
                      {screenshotIssue ? (
                        <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600">
                          {screenshotIssue}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {fieldError ? (
                    <p role="alert" className="mt-3 text-center text-sm font-medium text-rose-600">
                      {fieldError}
                    </p>
                  ) : null}

                  {stage === 'error' && error ? (
                    <div className="mt-4">
                      <ErrorState message={error} />
                    </div>
                  ) : null}

                  {stage === 'submitting' ? (
                    <div className="mt-4">
                      <PaymentStatus state="processing" message="Submitting your proof…" />
                    </div>
                  ) : null}
                </section>

                <Button
                  size="lg"
                  fullWidth
                  className="mt-6"
                  loading={stage === 'submitting' || stage === 'preparing' || upi.isLoading}
                  disabled={!readyToSubmit}
                  onClick={() => void submit()}
                >
                  {stage === 'submitting' ? 'Submitting…' : 'Submit payment proof'}
                </Button>

                {/*
                  Disabled is explained, not just greyed out. A button that is
                  simply inert tells a student nothing about the one field they
                  are still missing.
                */}
                {!readyToSubmit && stage !== 'submitting' && stage !== 'error' ? (
                  <p className="mt-2.5 text-center text-xs font-medium text-ink-500">
                    {proofAlreadyPending
                      ? 'Your payment proof is already under verification.'
                      : (missingEvidence ?? 'Preparing your payment…')}
                  </p>
                ) : null}

                <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-ink-500">
                  <ShieldCheck className="size-4 text-leaf-600" aria-hidden />
                  Verified by a human administrator before access is granted
                </p>
              </>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-ink-500">
            Questions about payment?{' '}
            <Link to="/faq" className="font-semibold text-brand-700 underline">
              Read the FAQs
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}

/* ========================================================================
   QR block — three genuinely different states
   ---------------------------------------------------------------------
   1. No QR configured  -> say so; the UPI ID below still works
   2. QR failed to load -> say so, offer a retry, keep the UPI ID usable
   3. QR loaded         -> show it, square and undistorted

   A broken image must never be reported as "payment details unavailable":
   the student can still pay by UPI ID, and telling them otherwise would send
   them away for no reason.
   =================================================================== */

function QrBlock({ src, onRetry }: { src: string | null; onRetry: () => void }) {
  const [failed, setFailed] = useState(false)
  // A new URL deserves a fresh attempt, so reset the failure when it changes.
  useEffect(() => setFailed(false), [src])

  if (!src) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <QrCode className="size-11 text-ink-300" aria-hidden />
        <p className="text-sm font-semibold text-ink-600">
          No QR code has been set up.
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-500">
          Pay using the UPI ID below, or open your UPI app from the button.
        </p>
      </div>
    )
  }

  if (failed) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-sun-200 bg-sun-50 p-5 text-center"
      >
        <QrCode className="size-10 text-sun-600" aria-hidden />
        <p className="text-sm font-bold text-ink-900">Unable to load the payment QR.</p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-600">
          You can still pay using the UPI ID below — it is the same address.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFailed(false)
            onRetry()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      {/* `aspect-square` + `h-auto` keeps it undistorted, `max-w-full` stops it
          overflowing a narrow card, and the width/height attributes reserve the
          right box before the image loads so the page does not jump.
          `onError` is what turns a broken image into the message above. */}
      <img
        src={src}
        alt="UPI QR code for payment"
        width={176}
        height={176}
        onError={() => setFailed(true)}
        className="aspect-square h-auto w-[176px] max-w-full rounded-xl border border-hairline bg-white p-2 sm:w-[200px]"
      />
    </div>
  )
}
