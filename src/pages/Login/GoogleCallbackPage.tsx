import { useEffect, useRef } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Logo } from '@/components/brand/Logo'
import { useAuth } from '@/context/AuthContext'

/* ========================================================================
   Post-OAuth landing
   ---------------------------------------------------------------------
   Django has already completed the OAuth exchange and set the session cookie
   before sending the browser here.

   This page deliberately does not treat the arrival as proof of identity. It
   asks the backend who it is, shows a loader while that happens, and only then
   moves the student on. The same check runs for a refresh, so this route is
   safe to bookmark.
   =================================================================== */

export function GoogleCallbackPage() {
  const { completeSignIn, status, isRestoring } = useAuth()
  const navigate = useNavigate()
  const started = useRef(false)

  useEffect(() => {
    // Guarded because StrictMode mounts effects twice in development; asking
    // twice would be wasteful but harmless, so the ref keeps it to once.
    if (started.current) return
    started.current = true

    void completeSignIn().then((user) => {
      navigate(user ? '/dashboard' : '/login?error=invalid-callback', { replace: true })
    })
  }, [completeSignIn, navigate])

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4">
      <Logo size={44} />
      <div role="status" aria-live="polite" className="text-center">
        <p className="text-[0.9375rem] font-medium text-ink-700">Signing you in…</p>
        <p className="mt-1 text-sm text-ink-500">
          {isRestoring
            ? 'Checking your session…'
            : 'Confirming your Google account with our servers…'}
        </p>
      </div>
    </div>
  )
}

export default GoogleCallbackPage
