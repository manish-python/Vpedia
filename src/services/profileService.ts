import type { AuthMeResponse, StudentProfile, User } from '@/types'
import type { ClassLevelDto, StreamDto } from '@/types/api'
import { ApiError, getList, request } from './client'
import { primeCsrf } from './authService'

/* ========================================================================
   Profile service
   ---------------------------------------------------------------------
   Read/write of the student's own profile against
   `GET|PATCH /api/v1/profile/me/`.

   Always the real backend. There is no fixture branch here: a mock profile
   would be indistinguishable from a saved one, and `updateCurrentClass`
   returning a fabricated "saved" object is exactly the kind of quiet lie
   this stage removed elsewhere.

   There is no password field, no password-change flow and no email/password
   reset here, and none will ever be: Google is the only sign-in method.

   The only mutable data is the class/stream preference, and that is a
   preference, not a credential and not an entitlement. Selecting Class 10
   changes what the dashboard suggests; it does not unlock Class 10. Access
   still requires an approved `ClassPurchase`, which the backend enforces
   independently of anything sent from this file.

   Ownership is never a parameter. There is no user id in the URL or the body,
   so a request cannot address another student's profile even if it tried.
   =================================================================== */

function toProfile(raw: AuthMeResponse['profile']): StudentProfile {
  return {
    // The number, not the primary key: `selectedClassId` is a `ClassId` and is
    // compared against catalogue entries, which are keyed by number.
    selectedClassId: raw?.selected_class_number ?? null,
    selectedClassName: raw?.selected_class_name ?? null,
    selectedStreamId: raw?.selected_stream ?? null,
    selectedStreamName: raw?.selected_stream_name ?? null,
    classRequiresStream: raw?.class_requires_stream ?? false,
    phoneNumber: raw?.phone_number ?? '',
  }
}

/** The signed-in student's profile, or null when signed out. */
export async function fetchProfile(signal?: AbortSignal): Promise<StudentProfile | null> {
  try {
    const res = await request<AuthMeResponse>('/profile/me/', { signal })
    return toProfile(res.data?.profile)
  } catch {
    return null
  }
}

/**
 * Resolve a class number to the primary key the profile endpoint expects.
 *
 * The UI addresses classes by number (7-12) because that is what URLs use, but
 * `ProfileUpdateSerializer.selected_class` is a `PrimaryKeyRelatedField`.
 * Sending the number addressed a different row or none at all, which is why
 * choosing a class could appear to do nothing.
 */
async function classLevelPkFor(
  classNumber: number | null,
  signal?: AbortSignal,
): Promise<number | null> {
  if (classNumber === null) return null
  const classes = await getList<ClassLevelDto>('/classes/', signal)
  const match = classes.find((dto) => dto.number === classNumber)
  if (!match) {
    throw new ApiError('That class is not available right now.', 404)
  }
  return match.id
}

/**
 * Resolve a stream to its primary key.
 *
 * `null` clears the stream, which is what Classes 7-10 need. A number is taken
 * to be a primary key already; a slug is looked up against the catalogue.
 */
async function streamPkFor(
  streamId: number | string | null,
  signal?: AbortSignal,
): Promise<number | null> {
  if (streamId === null) return null
  if (typeof streamId === 'number') return streamId

  const streams = await getList<StreamDto>('/streams/', signal)
  const match = streams.find((dto) => dto.slug === streamId)
  if (!match) {
    throw new ApiError('Please choose a valid stream.', 400)
  }
  return match.id
}

/**
 * Save the class/stream preference.
 *
 * The backend validates the pair: Classes 11 and 12 require a stream that is
 * actually offered for them, and Classes 7-10 must not carry one. A rejected
 * pair surfaces as the backend's own message rather than being silently
 * dropped here.
 */
export async function updateCurrentClass(
  classId: User['currentClassId'] | null,
  streamId: number | string | null = null,
  signal?: AbortSignal,
): Promise<StudentProfile> {
  // Django rejects unsafe methods without a CSRF token.
  await primeCsrf(signal)

  const classPk = await classLevelPkFor(classId, signal)
  const streamPk = await streamPkFor(streamId, signal)

  await request<null>('/profile/me/', {
    method: 'PATCH',
    body: { selected_class: classPk, selected_stream: streamPk },
    signal,
  })

  // Read back rather than echoing the request: the server is the source of
  // truth for what was actually stored.
  return (await fetchProfile(signal)) ?? toProfile(null)
}

/** Update the display name on the account. */
export async function updateProfileName(
  firstName: string,
  lastName: string,
  signal?: AbortSignal,
): Promise<void> {
  await primeCsrf(signal)
  await request<null>('/profile/me/', {
    method: 'PATCH',
    body: { first_name: firstName, last_name: lastName },
    signal,
  })
}