/* ========================================================================
   Admin service layer

   The only place in the admin UI that knows about URL shapes. Components ask
   for things ("the subjects matching these filters"), never for endpoints.

   Two rules hold throughout:

   1. No primary key is ever typed by an administrator. Writes send ids that
      came from a dropdown, reads send ids that came from a dropdown or a link.
   2. Filtered lists are always fetched through `adminList`, which drops empty
      values — an unset filter must never narrow a queryset to nothing.
   ===================================================================== */

import { apiUrl, get, getList, patch, patchForm, post, postForm } from '@/services/client'
import { primeCsrf } from '@/services/authService'
import type {
  AcademicOption, AdminChapter, AdminClass, AdminContent, AdminDashboard,
  AdminNotification, AdminPage, AdminOtherResource, AdminOtherResourceCategory,
  AdminPayment, AdminPurchase, AdminQuery, AdminStream, AdminStudent, AdminSubject,
  AdminUPI, AdminUser, ClassOption, SubjectOption,
} from './types'

/* ---------------------------------------------------------------------
   Session
   ------------------------------------------------------------------ */

export async function adminLogin(email: string, password: string): Promise<AdminUser> {
  await primeCsrf()
  const body = await post<{ authenticated: boolean; user: AdminUser }>(
    '/admin/login/',
    { email, password },
  )
  return body.user
}

export async function adminLogout(): Promise<void> {
  await primeCsrf()
  await post<null>('/admin/logout/')
}

export async function adminMe(signal?: AbortSignal): Promise<AdminUser> {
  const body = await get<{ authenticated: boolean; user: AdminUser }>('/admin/me/', signal)
  return body.user
}

/** The whole dashboard in one request; every figure is already aggregated. */
export function adminDashboard(signal?: AbortSignal): Promise<AdminDashboard> {
  return get<AdminDashboard>('/admin/dashboard/', signal)
}

/* ---------------------------------------------------------------------
   Lists
   ------------------------------------------------------------------ */

export function adminList<T>(
  resource: string,
  params: AdminQuery = {},
  signal?: AbortSignal,
): Promise<AdminPage<T>> {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  return get<AdminPage<T>>(`/admin/${resource}/${query.toString() ? `?${query}` : ''}`, signal)
}

/**
 * One page of any admin list.
 *
 * Pagination is deliberately page-number based rather than "next/previous only":
 * the Notification Center and the subject/chapter tables are the places an
 * administrator jumps into the middle of, and a pager they can aim at beats
 * clicking Next nine times.
 */
export function adminPage<T>(
  resource: string,
  params: AdminQuery & { page?: number } = {},
  signal?: AbortSignal,
): Promise<AdminPage<T>> {
  return adminList<T>(resource, params, signal)
}

export const adminClasses = (signal?: AbortSignal) => adminList<AdminClass>('classes', {}, signal)
export const adminStudents = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminStudent>('students', params, signal)
export const adminSubjects = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminSubject>('subjects', params, signal)
export const adminChapters = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminChapter>('chapters', params, signal)
export const adminContent = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminContent>('content', params, signal)
export const adminPayments = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminPayment>('payments', params, signal)
export const adminPurchases = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminPurchase>('purchases', params, signal)
export const adminStreams = (signal?: AbortSignal) => adminList<AdminStream>('streams', {}, signal)

/* ---------------------------------------------------------------------
   Writes
   ------------------------------------------------------------------ */

export const updateAdminClass = (id: number, data: Partial<AdminClass>) =>
  patch<AdminClass>(`/admin/classes/${id}/`, data)

/** `slug` is optional; the backend derives it when it is left blank. */
export const createAdminSubject = (data: Partial<AdminSubject>) =>
  post<AdminSubject>('/admin/subjects/', data)
export const updateAdminSubject = (id: number, data: Partial<AdminSubject>) =>
  patch<AdminSubject>(`/admin/subjects/${id}/`, data)

export const createAdminChapter = (data: Partial<AdminChapter>) =>
  post<AdminChapter>('/admin/chapters/', data)
export const updateAdminChapter = (id: number, data: Partial<AdminChapter>) =>
  patch<AdminChapter>(`/admin/chapters/${id}/`, data)

export const createAdminContent = (form: FormData) =>
  postForm<AdminContent>('/admin/content/', form)

/**
 * Editing class content.
 *
 * Multipart, always. `file` is optional: omit the key entirely when no
 * replacement was chosen, and the stored file is left untouched. Appending an
 * empty string would clear it, and appending the filename would send a string
 * where the serializer expects an upload.
 */
export const updateAdminContent = (id: number, data: Partial<AdminContent>) => {
  const form = toForm(data)
  return patchForm<AdminContent>(`/admin/content/${id}/`, form)
}

/**
 * Turn a write payload into multipart body parts.
 *
 * A `File` is appended as itself so the browser writes a real file part. Every
 * other value is stringified, because multipart has no type of its own and the
 * server reads booleans and integers from text either way.
 */
function toForm(data: Record<string, unknown>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    if (typeof File !== 'undefined' && value instanceof File) {
      form.append(key, value, value.name)
    } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
      form.append(key, value)
    } else {
      form.append(key, String(value))
    }
  }
  return form
}

/**
 * The staff-only document endpoint for one content item.
 *
 * Resolved through `apiUrl` so the URL carries the same base as every other
 * request and therefore the same first-party cookie. It is a relative service
 * path, never a storage path: the file's location on disk is not something the
 * browser is allowed to know.
 *
 * Separate from the student `contents/{slug}/document/`, which requires
 * `is_published` and `has_class_access` and so cannot preview a draft.
 */
export const adminContentDocumentUrl = (id: number): string =>
  apiUrl(`/admin/content/${id}/document/`)

/** The same, for an Other Resource. */
export const adminOtherResourceDocumentUrl = (id: number): string =>
  apiUrl(`/admin/other-resources/${id}/document/`)

export const approveAdminPayment = (id: number) =>
  post<AdminPayment>(`/admin/payments/${id}/approve/`)
export const rejectAdminPayment = (id: number, reason: string) =>
  post<AdminPayment>(`/admin/payments/${id}/reject/`, { reason })

export const adminUPI = (signal?: AbortSignal) => get<AdminUPI>('/admin/upi/', signal)
export const updateAdminUPI = (form: FormData) => patchForm<AdminUPI>('/admin/upi/1/', form)

/* ---------------------------------------------------------------------
   Notifications

   Read and mark-read only. There is no create call anywhere in this file, and
   that is not an omission: a notification is server-generated evidence of a
   real event, so a client that could post one could forge "payment approved".
   ------------------------------------------------------------------ */

export const adminNotifications = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminNotification>('notifications', params, signal)

/** Cheap enough to poll: one integer, one indexed count. */
export async function adminUnreadCount(signal?: AbortSignal): Promise<number> {
  const body = await get<{ unread: number }>('/admin/notifications/unread-count/', signal)
  return body.unread ?? 0
}

export const markNotificationRead = (id: number) =>
  patch<AdminNotification>(`/admin/notifications/${id}/read/`)

export async function markAllNotificationsRead(): Promise<number> {
  const body = await post<{ marked: number }>('/admin/notifications/mark-all-read/')
  return body.marked ?? 0
}

/* ---------------------------------------------------------------------
   Other Resources

   The second content system. Independent of ClassPurchase by construction —
   these endpoints never touch a purchase record.
   ------------------------------------------------------------------ */

export const adminResourceCategories = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminOtherResourceCategory>('other-resource-categories', params, signal)
export const adminOtherResources = (params: AdminQuery = {}, signal?: AbortSignal) =>
  adminList<AdminOtherResource>('other-resources', params, signal)

export const createResourceCategory = (data: Partial<AdminOtherResourceCategory>) =>
  post<AdminOtherResourceCategory>('/admin/other-resource-categories/', data)
export const updateResourceCategory = (id: number, data: Partial<AdminOtherResourceCategory>) =>
  patch<AdminOtherResourceCategory>(`/admin/other-resource-categories/${id}/`, data)

export const createOtherResource = (form: FormData) =>
  postForm<AdminOtherResource>('/admin/other-resources/', form)

/**
 * Editing an Other Resource.
 *
 * Multipart for the same reason as class content, and this also closes a silent
 * data-loss bug: the old JSON `patch` had nowhere to put a replacement file, so
 * choosing a new PDF appeared to save while the old one stayed attached.
 *
 * Publishing stays a plain JSON `patch` below - it only sets one flag and has no
 * file to carry, so it keeps the simplest transport.
 */
export const updateOtherResource = (id: number, data: Partial<AdminOtherResource>) => {
  const form = toForm(data as Record<string, unknown>)
  return patchForm<AdminOtherResource>(`/admin/other-resources/${id}/`, form)
}
/** Publishing is a status flag, not a separate operation. */
export const publishOtherResource = (id: number) =>
  patch<AdminOtherResource>(`/admin/other-resources/${id}/`, { is_published: true })
export const unpublishOtherResource = (id: number) =>
  patch<AdminOtherResource>(`/admin/other-resources/${id}/`, { is_published: false })

/* ========================================================================
   Dependent dropdown options

   These come from the existing public catalogue endpoints rather than new
   admin routes: they are unpaginated arrays, already expose both `id` (for
   the write request) and `slug` (for the child query), and are `AllowAny`,
   so no privileged round trip is needed to populate a form.
   ===================================================================== */

/**
 * GET /api/v1/classes/
 *
 * The wire field is `has_streams`; it is renamed here so the form reads one
 * vocabulary. Getting this wrong is silent: the Stream field simply never
 * appears, and Classes 11/12 content cannot be attached to a subject.
 */
export async function fetchClassOptions(signal?: AbortSignal): Promise<ClassOption[]> {
  const rows = await getList<{ id: number; name: string; slug: string; has_streams: boolean }>(
    '/classes/',
    signal,
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    hasStreams: Boolean(row.has_streams),
  }))
}

export async function fetchStreamOptions(classSlug: string, signal?: AbortSignal) {
  if (!classSlug) return []
  return getList<AcademicOption>(`/streams/?class=${encodeURIComponent(classSlug)}`, signal)
}

/**
 * GET /api/v1/subjects/?class=…&stream=…
 *
 * The `class` parameter is required, and `stream` is only sent when the class
 * actually uses streams. That is what makes the Subject dropdown show
 * Class 10 subjects for Class 10 and only Class 12 Science subjects for
 * Class 12 + Science — the restriction is done by the query, not by hiding
 * options in the browser.
 *
 * `classSlug`/`streamSlug` on each option record which query produced it, so a
 * caller can confirm an option really belongs to the selection currently in
 * the form rather than trusting a label.
 */
export async function fetchSubjectOptions(
  classSlug: string,
  streamSlug?: string | null,
  signal?: AbortSignal,
): Promise<SubjectOption[]> {
  if (!classSlug) return []
  const query = streamSlug ? `&stream=${encodeURIComponent(streamSlug)}` : ''
  const rows = await getList<{
    id: number
    name: string
    slug: string
    stream_name?: string | null
  }>(`/subjects/?class=${encodeURIComponent(classSlug)}${query}`, signal)
  const resolvedStream = streamSlug ?? null
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    classSlug,
    streamSlug: resolvedStream,
    streamName: row.stream_name ?? null,
  }))
}

export async function fetchChapterOptions(subjectSlug: string, signal?: AbortSignal) {
  if (!subjectSlug) return []
  return getList<AcademicOption>(`/subjects/${encodeURIComponent(subjectSlug)}/chapters/`, signal)
}