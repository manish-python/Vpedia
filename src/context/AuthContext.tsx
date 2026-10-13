import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  beginGoogleLogin,
  fetchSession,
  logout as logoutRequest,
  primeCsrf,
  type Session,
} from '@/services/authService'
import type { AuthState, StudentProfile, UnlockedClass, User } from '@/types'

/* ========================================================================
   AuthContext
   ---------------------------------------------------------------------
   Google OAuth is the only authentication path in the product.

   `loginWithGoogle` does not collect a token in the browser. It asks Django
   for the URL that begins the authorization-code flow and navigates there, so
   the `state` and PKCE verifier allauth generates stay on the server. Django
   sets an HttpOnly session cookie once Google has verified the student, and
   this context simply reflects what the backend reports.

   There is no password field, no email/password form, and no local session
   storage. `isRestoring` keeps protected screens behind a loader until the
   backend has actually answered, so a refresh never flashes protected
   content or bounces a signed-in student to the login screen.
   =================================================================== */

interface AuthContextValue extends AuthState {
  /** Starts the Google OAuth round trip. Returns false if unavailable. */
  loginWithGoogle: () => Promise<boolean>
  /** Called by the post-OAuth landing page to confirm the session. */
  completeSignIn: () => Promise<User | null>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  refreshUser: () => Promise<void>
  /** Class/stream preference. A preference only — grants no access. */
  profile: StudentProfile | null
  /** Classes with an approved purchase. */
  unlockedClasses: UnlockedClass[]
  /** True when the backend reported Google sign-in as unavailable. */
  googleUnavailable: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SIGNED_OUT: AuthState = {
  status: 'unauthenticated',
  user: null,
  error: null,
  isRestoring: true,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(SIGNED_OUT)
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [unlockedClasses, setUnlockedClasses] = useState<UnlockedClass[]>([])
  const [googleUnavailable, setGoogleUnavailable] = useState(false)

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const apply = useCallback((session: Session | null) => {
    if (!mounted.current) return

    if (!session) {
      setProfile(null)
      setUnlockedClasses([])
      setState({
        status: 'unauthenticated',
        user: null,
        error: null,
        isRestoring: false,
      })
      return
    }

    setProfile(session.profile)
    setUnlockedClasses(session.unlockedClasses)
    setState({
      status: 'authenticated',
      user: session.user,
      error: null,
      isRestoring: false,
    })
  }, [])

  // Ask the backend who we are, once, on first load.
  useEffect(() => {
    const controller = new AbortController()

    void (async () => {
      try {
        // Prime CSRF first so the very first unsafe call after this works.
        await primeCsrf(controller.signal)
        apply(await fetchSession(controller.signal))
      } catch (cause) {
        if (mounted.current) {
          // An aborted request means the effect was cancelled (StrictMode runs
          // effects twice on mount), not that the session check failed. Leave
          // `isRestoring` set so the second pass can settle it.
          if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
            setState({
              status: 'unauthenticated',
              user: null,
              error: 'Unable to reach the server. Please try again.',
              isRestoring: false,
            })
          }
        }
      }
    })()

    return () => controller.abort()
  }, [apply])

  const loginWithGoogle = useCallback(async () => {
    setState((prev: AuthState) => ({
      ...prev,
      status: 'authenticating',
      error: null,
      isRestoring: false,
    }))

    try {
      const url = await beginGoogleLogin()

      if (!url) {
        // Google sign-in is not configured on this backend. Fail closed with a
        // clear message rather than pretending to sign anyone in.
        setGoogleUnavailable(true)
        if (mounted.current) {
          setState({
            status: 'error',
            user: null,
            error: 'Google sign-in is not configured on this server yet.',
            isRestoring: false,
          })
        }
        return false
      }

      // A full-page navigation to the backend. This promise never resolves in
      // the usual sense: the browser leaves the document here.
      window.location.assign(url)
      return true
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.'
      if (mounted.current) {
        setState({ status: 'error', user: null, error: message, isRestoring: false })
      }
      return false
    }
  }, [])

  const completeSignIn = useCallback(async () => {
    try {
      await primeCsrf()
      const session = await fetchSession()
      apply(session)
      return session?.user ?? null
    } catch {
      apply(null)
      return null
    }
  }, [apply])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      // Even if the request failed, stop claiming to be signed in locally.
      apply(null)
    }
  }, [apply])

  const refresh = useCallback(async () => {
    try {
      await primeCsrf()
      apply(await fetchSession())
    } catch {
      apply(null)
    }
  }, [apply])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loginWithGoogle,
      completeSignIn,
      logout,
      refresh,
      refreshUser: refresh,
      profile,
      unlockedClasses,
      googleUnavailable,
    }),
    [state, loginWithGoogle, completeSignIn, logout, refresh, profile, unlockedClasses, googleUnavailable],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.')
  return context
}
