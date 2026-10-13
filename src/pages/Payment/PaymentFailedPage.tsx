import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { CircleHelp, XCircle } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/common/Button'
import { useAsync, useSeo } from '@/hooks'
import { resolveClass } from '@/services/resolveService'
import type { VClass } from '@/types'

/* ========================================================================
   Payment failed
   Shows what to try next plus a support route. Never leaves the student at
   a dead end.
   =================================================================== */

interface FailedLocationState {
  classId?: number
  message?: string
}

export function PaymentFailedPage() {
  const location = useLocation()
  const state = (location.state ?? {}) as FailedLocationState
  const [searchParams] = useSearchParams()

  /**
   * The class comes from the router state set at checkout. A reload, a
   * back-button entry or a bookmarked link carries no state, so the query
   * string is accepted as a fallback rather than losing the student's place.
   */
  const classIdFromQuery = Number(searchParams.get('class'))
  const classId = state.classId ?? (Number.isInteger(classIdFromQuery) ? classIdFromQuery : undefined)

  // Resolved from the catalogue rather than a local lookup, so the class name
  // and price shown are the ones the backend currently serves.
  const { data: vClass } = useAsync<VClass | null>(
    (signal) => (classId ? resolveClass(classId, signal) : Promise.resolve(null)),
    [classId],
    { enabled: classId !== undefined },
  )

  useSeo({
    title: 'Payment Failed',
    description: 'Your payment could not be completed.',
    path: '/payment/failed',
    noIndex: true,
  })

  // Nothing was selected, so send them back to the class list.
  if (!vClass) {
    return <Navigate to="/classes" replace />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-hairline bg-white">
        <div className="container-page flex h-16 items-center justify-center">
          <Link to="/" aria-label="VPEDIA LEARNING home">
            <Logo size={34} />
          </Link>
        </div>
      </header>

      <main id="main" className="container-page flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-lg text-center">
          <div
            aria-hidden
            className="mx-auto flex size-24 animate-pop-in items-center justify-center rounded-full bg-rose-50 ring-8 ring-rose-50/60"
          >
            <XCircle className="size-12 text-rose-500" strokeWidth={2.2} />
          </div>

          <h1 className="mt-7 animate-fade-up text-3xl font-extrabold sm:text-4xl">Payment Failed</h1>

          <p className="mx-auto mt-3.5 max-w-md animate-fade-up text-ink-600">
            Your payment could not be completed.
          </p>

          {state.message ? (
            <p role="status" className="mx-auto mt-4 max-w-md text-sm text-ink-500">
              {state.message}
            </p>
          ) : null}

          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-500">
            No amount was charged. You can try again, or reach out to us if the problem keeps
            happening.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <ButtonLink
              to={`/purchase/${vClass.id}`}
              size="lg"
              className="sm:min-w-44"
            >
              Try Again
            </ButtonLink>
            <ButtonLink to={`/classes/${vClass.id}`} variant="outline" size="lg" className="sm:min-w-44">
              Back to Class
            </ButtonLink>
          </div>

          {/* Support */}
          <div className="mt-10 rounded-2xl border border-hairline bg-white p-5 text-left shadow-card">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
              >
                <CircleHelp className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-[0.9375rem] font-bold text-ink-900">Need help?</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  If your bank shows a debit but access was not granted, contact support with your
                  payment reference and we will unlock it manually.
                </p>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <ButtonLink to="/faq" variant="soft" size="sm">
                    Read FAQs
                  </ButtonLink>
                  <a
                    href="mailto:support@vpedialearning.com"
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline px-3 text-sm font-semibold text-ink-700 transition-colors hover:border-brand-300 hover:text-brand-700"
                  >
                    Email support
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
