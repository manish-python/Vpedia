/* ========================================================================
   Formatting helpers — one place so currency and dates stay consistent.
   =================================================================== */

/** ₹ with Indian digit grouping. */
export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

/** "5 Oct 2026" — the date format used across library and profile. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * "8 Oct 2026, 11:07" - date plus local time.
 *
 * Payment verification is a timeline: "submitted" and "reviewed" can be minutes
 * apart and the difference matters, so a bare date is not enough.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  const day = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day}, ${time}`
}

/** "Oct 2026" — compact month/year form. */
export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** "Just now" / "2 days ago" — notification timestamps. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSeconds = Math.round((now.getTime() - then) / 1000)
  if (diffSeconds < 60) return 'Just now'
  const minutes = Math.round(diffSeconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(iso)
}

/** "Rahul" from "Rahul Sharma" — used in the dashboard greeting. */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there'
  const trimmed = fullName.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0] ?? 'there'
}

/** Two-letter monogram for the avatar fallback. */
export function initials(fullName: string | null | undefined): string {
  if (!fullName) return 'VL'
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? 'V'
  const second = parts.length > 1 ? (parts[1]?.[0] ?? '') : (parts[0]?.[1] ?? '')
  return `${first}${second}`.toUpperCase()
}

/**
 * The document label on a content card: `PDF · 24 pages`, or just `PDF`.
 *
 * `null` means the backend could not determine a count — a truncated or
 * unreadable upload, or a file stored before the count existed. That is an
 * honest "unknown", so it is shown as plain `PDF`.
 *
 * There is deliberately no zero fallback. "0 pages" is not a shorter way of
 * saying "unknown"; it is a false statement about a document that plainly has
 * pages, and it is exactly what this rendered for every card in the product
 * while the database column sat empty.
 */
export function pageLabel(pageCount: number | null | undefined): string {
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount) || pageCount < 1) {
    return 'PDF'
  }
  return `PDF · ${pageCount} page${pageCount === 1 ? '' : 's'}`
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

/** Trims a long description to a single tidy line for list rows. */
export function truncate(value: string, max = 64): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}
