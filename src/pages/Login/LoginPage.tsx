import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Check, ShieldCheck } from 'lucide-react'

import { Link } from 'react-router-dom'

import { Logo } from '@/components/brand/Logo'
import { GoogleSignInButton } from '@/components/common/GoogleIcon'
import { Spinner } from '@/components/common/Spinner'
import { useAuth } from '@/context/AuthContext'
import { useSeo } from '@/hooks/useSeo'

/* ========================================================================
   Google login
   ---------------------------------------------------------------------
   Google OAuth is the only sign-in path in VPEDIA LEARNING. There is no
   username, password, confirmation field, forgot-password link or
   email-registration form anywhere on this screen — by design.

   The button starts a full-page navigation to the Django backend, which
   performs the OAuth exchange and sets the session cookie. No Google client
   id, credential or token is handled in the browser.
   =================================================================== */

const TRUST_POINTS = [
  'No password to remember',
  'Your purchases stay linked to your account',
  'Sign in on any device',
]

/** Reasons the backend can send a student back here, and what to say. */
const ERROR_MESSAGES: Record<string, string> = {
  auth_cancelled: 'You cancelled Google sign-in, so nothing was changed.',
  unverified_email:
    'Google did not verify that email address, so we could not create an account.',
  unsupported_provider: 'Please sign in with Google.',
  'invalid-callback': 'That sign-in link is no longer valid. Please try again.',
}

export function LoginPage() {
  useSeo({
    title: 'Sign in',
    description: 'Sign in to VPEDIA LEARNING with your Google account to access your study material.',
    path: '/login',
    noIndex: true,
  })

  const { status, user, error, loginWithGoogle, googleUnavailable } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  // A failed or cancelled round trip comes back as `?error=<code>`.
  const oauthError = searchParams.get('error')
  const bannerMessage = oauthError
    ? (ERROR_MESSAGES[oauthError] ?? 'We could not sign you in. Please try again.')
    : error

  const clearError = () => {
    if (!oauthError) return
    const next = new URLSearchParams(searchParams)
    next.delete('error')
    setSearchParams(next, { replace: true })
  }

  if (status === 'authenticated' && user) {
    return <Navigate to={redirectTo} replace />
  }

  const signingIn = status === 'authenticating'

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-mesh">
      {/* Ambient wash. Purely decorative and behind everything, so it can never
          intercept a click or appear in the accessibility tree. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-gradient-to-b from-brand-100/50 via-transparent to-transparent"
      />

      <header className="relative border-b border-hairline/70 bg-white/70 backdrop-blur-sm">
        <div className="container-page flex h-16 items-center justify-between sm:h-[4.5rem]">
          <Link to="/" aria-label="VPEDIA LEARNING home" className="rounded-xl">
            <Logo size={34} />
          </Link>
          <Link
            to="/"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-white hover:text-ink-900"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[26rem] animate-fade-up">
          <div className="rounded-3xl border border-hairline bg-white p-6 shadow-panel sm:p-8">
            <div className="flex justify-center">
              <Logo size={44} />
            </div>

            <h1 className="mt-6 text-center text-2xl font-extrabold sm:text-[1.75rem]">
              Welcome to VPEDIA LEARNING
            </h1>
            <p className="mx-auto mt-2.5 max-w-xs text-center text-[0.9375rem] leading-relaxed text-ink-500">
              Your class-wise learning resources, all in one place.
            </p>

            <GoogleSignInButton
              className="mt-7"
              loading={signingIn}
              disabled={googleUnavailable}
              onClick={() => {
                clearError()
                void loginWithGoogle()
              }}
            />

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
              <ShieldCheck className="size-3.5 shrink-0 text-leaf-600" strokeWidth={2.4} aria-hidden />
              Secure sign-in with your Google account.
            </p>

            {signingIn ? (
              <p role="status" className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-500">
                <Spinner size={15} className="text-brand-600" />
                Taking you to Google…
              </p>
            ) : null}

            {bannerMessage ? (
              <p role="alert" className="mt-3 text-center text-sm font-medium text-rose-600">
                {bannerMessage}
              </p>
            ) : null}

            {googleUnavailable ? (
              <p className="mt-3 text-center text-xs leading-relaxed text-ink-400">
                Google sign-in has not been configured on the server yet. Please contact support
                if you need an account.
              </p>
            ) : null}

            <ul className="mt-7 space-y-2.5 border-t border-hairline pt-6">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-leaf-50 text-leaf-600"
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm font-medium text-ink-700">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal. These are anchors on the FAQ page, which is where the policy
              text actually lives - linking to invented routes would 404. */}
          <p className="mt-6 text-center text-xs text-ink-500">
            By continuing you agree to our{' '}
            <Link
              to="/faq#privacy"
              className="font-semibold text-brand-700 underline underline-offset-2"
            >
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link
              to="/faq#terms"
              className="font-semibold text-brand-700 underline underline-offset-2"
            >
              Terms
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}

