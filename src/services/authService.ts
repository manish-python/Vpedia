import type { AppNotification, AuthConfigResponse, AuthMeResponse, StudentProfile, UnlockedClass, User } from '@/types'
import { CLASS_NUMBERS } from '@/data/presentation'
import { NOTIFICATIONS } from '@/data/support'
import { ApiError, MOCK_MODE, backendUrl, mockRequest, rememberCsrfToken, request } from './client'

/* ========================================================================
   Auth service — Google OAuth only
   ---------------------------------------------------------------------
   There is no username, no password, no registration form and no credential
   exchange endpoint anywhere in this file. The browser never sees an OAuth
   token or a client secret.

   The flow:
     1. `fetchAuthConfig()` asks the backend whether Google sign-in is
        available and where to send the browser.
     2. `beginGoogleLogin()` returns that URL. The caller performs a
        full-page navigation, so allauth keeps the `state` and the PKCE
        verifier on the server where they belong.
     3. Google redirects back to Django, which validates the response and
        issues an HttpOnly session cookie.
     4. Django forwards to `/auth/google/callback` on this app. That page
        calls `fetchSession()` to confirm the session for real.

   The session cookie is the only credential. It is HttpOnly, so this code
   cannot read it even if it wanted to.
   =================================================================== */

/* ---------------------------------------------------------------------
   Mapping
   ------------------------------------------------------------------ */

/**
 * The backend sends `selected_class` as a primary key; the UI addresses
 * classes by number (`/classes/10`), and the API reports that number
 * separately as `selected_class_number`.
 *
 * Falling back to a class number would be a lie — it would render "Class 7"
 * for a student who chose Class 10 — so this returns null and the dashboard
 * says "No class selected" instead.
 */
function toClassId(value: number | null): User['currentClassId'] {
  if (value === null || value === undefined) return null
  const found = CLASS_NUMBERS.find((id) => id === value)
  return found ?? null
}

function toProfile(raw: AuthMeResponse['profile']): StudentProfile {
  return {
    selectedClassId: raw?.selected_class_number ?? null,
    selectedClassName: raw?.selected_class_name ?? null,
    selectedStreamId: raw?.selected_stream ?? null,
    selectedStreamName: raw?.selected_stream_name ?? null,
    classRequiresStream: raw?.class_requires_stream ?? false,
    phoneNumber: raw?.phone_number ?? '',
  }
}

/** Convert the backend's account shape into the app's `User`. */
function toUser(
  raw: NonNullable<AuthMeResponse['user']>,
  profile: StudentProfile,
  unlocked: UnlockedClass[],
): User {
  const name = raw.full_name?.trim() || raw.first_name || raw.email
  return {
    id: String(raw.id),
    name,
    email: raw.email,
    avatarUrl: raw.avatar_url ?? null,
    currentClassId: toClassId(profile.selectedClassId),
    joinedAt: raw.date_joined,
    // A student with at least one approved purchase is treated as returning.
    status: unlocked.length > 0 ? 'returning' : 'new',
  }
}

/* ---------------------------------------------------------------------
   Session
   ------------------------------------------------------------------ */

export interface Session {
  user: User
  profile: StudentProfile
  unlockedClasses: UnlockedClass[]
}

/**
 * Fetch and cache a CSRF token.
 *
 * Django's `SessionAuthentication` requires `X-CSRFToken` on every unsafe
 * method. The cookie is set here and echoed back by the transport.
 */
export async function primeCsrf(signal?: AbortSignal): Promise<void> {
  const res = await request<{ csrfToken: string }>('/auth/csrf/', { signal })
  if (res.data?.csrfToken) rememberCsrfToken(res.data.csrfToken)
}

/**
 * Read the current session.
 *
 * Returns null when signed out. A 401 from any endpoint means the session is
 * gone, which is also reported as "signed out" rather than as an error.
 */
export async function fetchSession(signal?: AbortSignal): Promise<Session | null> {
  let payload: AuthMeResponse
  try {
    const res = await request<AuthMeResponse>('/auth/me/', { signal })
    payload = res.data
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) return null
    throw cause
  }

  if (!payload?.authenticated || !payload.user) return null

  const profile = toProfile(payload.profile)
  return {
    user: toUser(payload.user, profile, payload.unlocked_classes ?? []),
    profile,
    unlockedClasses: payload.unlocked_classes ?? [],
  }
}

/** Convenience wrapper matching the pre-OAuth service name. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<User | null> {
  return (await fetchSession(signal))?.user ?? null
}

/* ---------------------------------------------------------------------
   Sign in / sign out
   ------------------------------------------------------------------ */

/** Whether Google sign-in is available on the configured backend. */
export async function fetchAuthConfig(signal?: AbortSignal): Promise<AuthConfigResponse> {
  try {
    const res = await request<AuthConfigResponse>('/auth/config/', { signal })
    return res.data
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 503) {
      // Missing configuration is a supported state, not a failure.
      return { google_enabled: false, login_url: null }
    }
    throw cause
  }
}

/**
 * The URL that starts the Google OAuth round trip.
 *
 * Returns null when Google sign-in is not configured on the backend, so the
 * caller can explain that instead of navigating into a broken flow.
 */
export async function beginGoogleLogin(signal?: AbortSignal): Promise<string | null> {
  const config = await fetchAuthConfig(signal)
  if (!config.google_enabled || !config.login_url) return null

  // Re-read the start endpoint for the canonical URL with `process` and `next`.
  const res = await request<{ login_url: string }>('/auth/google/', { signal })
  return backendUrl(res.data.login_url)
}

/**
 * Terminate the session on the server.
 *
 * The backend deletes the session row and expires the cookie. Clearing
 * anything in the browser afterwards is cosmetic — the cookie it holds is
 * already worthless.
 */
export async function logout(signal?: AbortSignal): Promise<void> {
  await primeCsrf(signal)
  await request<null>('/auth/logout/', { method: 'POST', signal })
}

/* ---------------------------------------------------------------------
   Notifications
   ------------------------------------------------------------------
   Not part of Stage 3. Still fixture-backed so removing auth mocking did not
   drag unrelated features along with it.

   Profile reads and writes live in `profileService`, which already existed;
   they were adapted to the real backend contract rather than duplicated here.
   ------------------------------------------------------------------ */

export async function fetchNotifications(signal?: AbortSignal): Promise<AppNotification[]> {
  if (MOCK_MODE) return (await mockRequest(NOTIFICATIONS, { signal, min: 200, max: 400 })).data
  return (await request<AppNotification[]>('/notifications', { signal })).data
}

export async function markNotificationsRead(signal?: AbortSignal): Promise<void> {
  if (MOCK_MODE) {
    await mockRequest(null, { signal, min: 120, max: 240 })
    return
  }
  await request<null>('/notifications/read', { method: 'POST', signal })
}
