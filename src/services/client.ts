/* ========================================================================
   HTTP seam
   Every service in this folder talks to the backend through this module.

   Authentication is an HTTP-only session cookie issued by Django, so every
   request must send credentials. In development Vite proxies `/api` to the
   backend (see vite.config.ts), which keeps the cookie first-party and avoids
   any cross-site cookie restriction.

   There are no fixtures behind any production service. The catalogue, subjects,
   chapters, content, purchases and payments all read PostgreSQL through Django.
   `MOCK_MODE` survives only for the notifications fixture, which has no backend
   endpoint at all and is out of scope; it is not a fallback for real data, and
   nothing here silently degrades to sample content if the API is unreachable.
   ===================================================================== */

import type { ApiResponse, PaginatedResponse } from '@/types'
import type { PaginatedDto } from '@/types/api'

/**
 * Base URL for every API request.
 *
 * `/api/v1` in development, where Vite proxies it same-origin. Set it to an
 * absolute URL in production, e.g. `https://api.vpedialearning.com/api/v1`.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

/**
 * Fixture latency simulator for the notifications list only.
 *
 * This is NOT a data-source switch. It never substitutes sample classes,
 * purchases or content — if the backend is unreachable, the request fails and
 * the UI shows an error, because a believable fake catalogue is far worse than
 * an honest failure.
 */
export const MOCK_MODE = import.meta.env.VITE_USE_MOCKS !== 'false'

/** Django issues this cookie; we read it and echo it back on unsafe methods. */
const CSRF_COOKIE = 'vpedia_csrftoken'

export class ApiError extends Error {
  readonly status: number

  /** Per-field messages from a DRF 400, for rendering next to an input. */
  readonly fields: Record<string, string[]>

  constructor(message: string, status = 500, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Set for multipart bodies, where the browser must add the boundary. */
  raw?: boolean
  /** Extra headers, merged last. */
  headers?: Record<string, string>
}

/** Reads the CSRF cookie, or null when it has not been issued yet. */
export function readCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]*)`))
  const value = match?.[1]
  return value ? decodeURIComponent(value) : null
}

let csrfToken: string | null = null

/** Caches the token so repeated calls do not need to re-read the cookie. */
export function rememberCsrfToken(token: string): void {
  csrfToken = token
}

function csrfHeader(): Record<string, string> {
  const token = csrfToken ?? readCsrfToken()
  return token ? { 'X-CSRFToken': token } : {}
}

/**
 * Pull a human-readable message out of a DRF error body.
 *
 * DRF returns several shapes: `{"detail": "..."}`, `{"field": ["..."]}`, or
 * `{"field": "..."}`. Anything unrecognised falls back to a generic message so
 * a raw status code or an object never reaches the screen.
 *
 * `isJson` matters: Django's `DEBUG = True` error handler answers with an HTML
 * page, not JSON. Trusting the body there is how a whole traceback — settings,
 * SQL, file paths — ends up rendered inside the app, so an HTML body is refused
 * outright and replaced with a status-appropriate sentence.
 */
function messageFromBody(body: unknown, status: number, isJson: boolean): string {
  if (isJson) {
    if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 400)

    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>

      if (typeof record.detail === 'string') return record.detail

      for (const [field, value] of Object.entries(record)) {
        if (field === 'status') continue
        const text = Array.isArray(value) ? value.join(' ') : value
        if (typeof text === 'string' && text.trim()) {
          return field === 'non_field_errors' ? text.trim() : text.trim()
        }
      }
    }
  }

  return genericMessageFor(status)
}

/**
 * The message shown when the server gave us nothing safe to display.
 *
 * 500 and above deliberately say nothing about the cause: the real reason lives
 * in the server log, not in the browser.
 */
export function genericMessageFor(status: number): string {
  if (status === 0) return 'Unable to reach the server. Check your connection and try again.'
  if (status === 400) return 'Some of the details entered are not valid.'
  if (status === 401) return 'Please sign in to continue.'
  if (status === 403) return "You don't have permission to do that."
  if (status === 404) return 'That item no longer exists.'
  if (status === 405) return 'That action is not available here.'
  if (status === 409) return 'That conflicts with something already saved.'
  if (status === 413) return 'That file is too large.'
  if (status === 429) return 'Too many requests. Please wait a moment.'
  if (status >= 500) return 'The server ran into a problem loading this. Please try again.'
  return 'Something went wrong.'
}

/** True when a body looks like markup rather than an API payload. */
function looksLikeHtml(body: unknown): boolean {
  if (typeof body !== 'string') return false
  const head = body.slice(0, 400).trimStart().toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml')
}

/** Per-field messages from a DRF 400, so a form can show them inline. */
export function fieldErrors(error: unknown): Record<string, string[]> {
  if (error instanceof ApiError) return error.fields
  return {}
}

/** Flatten a DRF `{"field": ["msg", ...]}` body into `{ field: string[] }`. */
function collectFieldErrors(body: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === 'detail' || key === 'status') continue
    const list = Array.isArray(value) ? value : [value]
    const messages = list.filter((item): item is string => typeof item === 'string')
    if (messages.length) out[key] = messages
  }
  return out
}

/**
 * Thin fetch wrapper.
 *
 * Sends and receives the session cookie, and attaches the CSRF token to every
 * unsafe request so Django's `SessionAuthentication` accepts it. No bearer
 * token is ever attached or stored: the session cookie is HttpOnly and
 * unreachable from JavaScript by design.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const { method = 'GET', body, signal, raw = false, headers: extra } = options
  const unsafe = method !== 'GET' && method !== 'DELETE'

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      // Required for the session cookie to travel with the request.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
        ...(unsafe ? csrfHeader() : {}),
        ...(extra ?? {}),
      },
      ...(body ? { body: raw ? (body as BodyInit) : JSON.stringify(body) } : {}),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0)
  }

  if (response.status === 204) {
    return { data: null as T, message: 'OK', status: 204 }
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      // Not JSON. Usually a Django HTML error page under DEBUG, or an HTML 404
      // from a misconfigured proxy. It is never shown to the user.
      payload = text
    }
  }

  if (!response.ok) {
    const contentType = response.headers.get('Content-Type') ?? ''
    const isJson = contentType.includes('json')
    const html = looksLikeHtml(payload)

    // Refuse the body when it is not JSON, or when JSON turned out to be HTML.
    const fields = isJson && !html ? collectFieldErrors(payload) : {}
    throw new ApiError(
      messageFromBody(payload, response.status, isJson && !html),
      response.status,
      fields,
    )
  }

  return { data: (payload as { data: T })?.data ?? (payload as T), message: 'OK', status: response.status }
}

/* ---------------------------------------------------------------------
   Collection helpers
   ---------------------------------------------------------------------
   Django does not answer every list the same way. The catalogue endpoints
   disable pagination and return a bare array; `/my-classes/` returns
   `{ count, results }`; a paginated endpoint would return
   `{ count, next, previous, results }`.

   `getList` collapses all three into a plain array so no caller has to
   branch, and so a future backend change from array to paginated cannot
   silently produce an empty page.
   ------------------------------------------------------------------ */

/** True for the shapes DRF uses to carry a collection. */
function extractCollection(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: unknown[] }).results
  }
  return null
}

/** GET a collection and return it as a plain array. */
export async function getList<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const { data } = await request<unknown>(path, { signal })
  const collection = extractCollection(data)
  if (collection === null) {
    throw new ApiError('The server returned an unexpected list shape.', 500)
  }
  return collection as T[]
}

/** GET a paginated collection, exposing the pager. */
export async function getPaginated<T>(
  path: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<T>> {
  const { data } = await request<PaginatedDto<T>>(path, { signal })
  const results = Array.isArray(data?.results) ? data.results : []
  return {
    items: results,
    total: data?.count ?? results.length,
    page: 1,
    pageSize: results.length,
    hasMore: Boolean(data?.next),
  }
}

/* ---------------------------------------------------------------------
   Multipart upload
   ---------------------------------------------------------------------
   Used for the payment screenshot. The browser must add the multipart
   boundary itself, so no `Content-Type` is set here — that is what the
   `raw` flag is for.
   ------------------------------------------------------------------ */

/** POST a `FormData` body. Any file is sent as-is; the server revalidates it. */
export async function postForm<T>(
  path: string,
  form: FormData,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await request<T>(path, { method: 'POST', body: form, raw: true, signal })
  return data
}

/** PATCH a `FormData` body, for the same reason as `postForm`. */
export async function patchForm<T>(
  path: string,
  form: FormData,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await request<T>(path, { method: 'PATCH', body: form, raw: true, signal })
  return data
}

/* ---------------------------------------------------------------------
   Convenience verbs
   ------------------------------------------------------------------ */

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request<T>(path, { signal })).data
}

export async function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return (await request<T>(path, { method: 'POST', body, signal })).data
}

export async function patch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return (await request<T>(path, { method: 'PATCH', body, signal })).data
}

export async function del<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await request<T>(path, { method: 'DELETE', signal })).data
}

/**
 * Build a query string from defined values only.
 *
 * `undefined`, `null` and `''` are dropped so an optional filter never turns
 * into `?stream=` and accidentally narrows a backend queryset.
 */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/* ---------------------------------------------------------------------
   Mock transport
   ------------------------------------------------------------------ */

/** Simulated latency so loading states are real, not decorative. */
export function delay(min = 180, max = 420, signal?: AbortSignal): Promise<void> {
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function mockRequest<T>(
  data: T,
  options: { message?: string; min?: number; max?: number } & RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { message = 'OK', min = 180, max = 420, signal } = options
  await delay(min, max, signal)
  return { data, message, status: 200 }
}

/** Small chance of a recoverable failure, so error states are reachable. */
export function maybeFail(shouldFail: boolean, message = 'Unable to load content.'): void {
  if (shouldFail) throw new ApiError(message, 503)
}

/**
 * Turn a server-provided path into something `window.location` can navigate to.
 *
 * Django returns root-relative paths that already include `/api/v1` (for
 * example `/api/v1/accounts/google/login/?...`). Those are used verbatim: the
 * base URL must not be prepended again, or the browser would request
 * `/api/v1/api/v1/...`.
 *
 * Only a genuinely relative fragment gets the base URL.
 */
export function backendUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/')) return path
  return `${BASE_URL}/${path}`
}

/**
 * Absolute URL for a service path composed here in the client.
 *
 * The opposite rule to `backendUrl`: `/contents/…` is a service path, not a
 * root-relative URL, so it does need the base. Used where something other
 * than `fetch` has to load the URL — PDF.js fetching a gated document, an
 * `<img src>`, a form post.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const withSlash = path.startsWith('/') ? path : `/${path}`
  return `${BASE_URL}${withSlash}`
}
