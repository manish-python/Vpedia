/* ========================================================================
   Admin API shapes

   Every field here is camelCase as the admin UI prefers to read it, and the
   mapping from Django's snake_case wire format happens in `service.ts`. Where a
   field is genuinely technical — `class_level` is a primary key, not a label —
   the camelCase twin carries the readable name alongside it, so a table column
   never has to render a raw id.
   ===================================================================== */

export interface AdminUser {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  avatar_url: string
  email_verified: boolean
  is_active: boolean
  is_staff: boolean
  date_joined: string
  selected_class: { id: number; number: number | null; name: string } | null
  selected_stream: { id: string; slug: string; name: string } | null
  active_purchases: number
}

export interface AdminPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface AdminClass {
  id: number
  number: number | null
  name: string
  slug: string
  description: string
  price: string
  currency: string
  display_order: number
  has_streams: boolean
  is_active: boolean
  subject_count: number
  purchase_count: number
}

export interface AdminStudent extends AdminUser {}

export interface AdminStream {
  id: number
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  class_levels: number[]
}

export interface AdminSubject {
  id: number
  /** Primary key. Used for writes; never rendered. */
  class_level: number
  /** Display name of the class, resolved server-side. */
  class_name: string
  stream: number | null
  stream_name: string | null
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  chapter_count: number
}

export interface AdminChapter {
  id: number
  subject: number
  subject_name: string
  class_name: string
  stream_name: string | null
  class_level_id: number
  stream_id: number | null
  number: number
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  content_count: number
}

export interface AdminContent {
  id: number
  chapter: number
  chapter_name: string
  subject_name: string
  class_name: string
  title: string
  slug: string
  description: string
  content_type: string
  page_count: number | null
  display_order: number
  is_published: boolean
  /**
   * A storage URL on read, a `File` on write.
   *
   * DRF's `FileField` behaves the same way, so one type covers both directions.
   * Upload new material through `FormData`, not a JSON body.
   */
  file: string | File | null
  file_name: string | null
  file_size: number | null
  created_at: string
  updated_at: string
}

export interface AdminPurchase {
  id: number
  user: number
  student_name: string
  email: string
  class_level: number
  class_name: string
  stream: number | null
  amount: string
  currency: string
  status: string
  created_at: string
  activated_at: string | null
  approved_by_email: string | null
  approved_at: string | null
}

export interface AdminPayment {
  id: number
  user: number
  student_name: string
  email: string
  class_purchase: number
  class_name: string
  amount: string
  currency: string
  utr: string
  transaction_id: string
  status: string
  submitted_at: string
  reviewed_at: string | null
  reviewed_by_email: string | null
  rejection_reason: string
  admin_note: string
  screenshot_url: string | null
}

/* ---------------------------------------------------------------------
   Dashboard V2

   One request, every number already aggregated by SQL. The frontend renders
   these; it never counts rows itself.
   ------------------------------------------------------------------ */

/** One point on the registration trend line. */
export interface TrendPoint {
  date: string
  count: number
}

export interface DashboardStat {
  label: string
  value: number
  hint?: string
}

export interface AdminDashboard {
  /* Top-line cards */
  students: number
  classes: number
  active_purchases: number
  pending_payments: number
  pending_purchases: number
  rejected_purchases: number
  /** Sum of ACTIVE purchases only. Never includes pending or rejected. */
  approved_revenue: string
  published_content: number
  draft_content: number
  other_resources: number
  unread_notifications: number

  /* Breakdowns */
  student_growth: { today: number; week: number; month: number }
  registration_trend: TrendPoint[]
  purchases_by_class: Array<{ class_id: number; name: string; number: number | null; count: number }>
  payment_status: {
    pending: number
    approved: number
    rejected: number
    pending_amount: string
  }
  purchase_status: {
    active: number
    pending: number
    rejected: number
    cancelled: number
  }
  content_types: Record<string, number>
  resource_stats: {
    total: number
    published: number
    draft: number
    active_categories: number
  }
  recent_activity: AdminNotification[]

  /* Kept for existing consumers of the v1 payload. */
  payments: Record<string, number>
  recent_payments: AdminPayment[]
}

export interface AdminUPI {
  upi_id: string
  display_name: string
  instructions: string
  is_active: boolean
  qr_code: string | null
  qr_code_url: string | null
}

/* ---------------------------------------------------------------------
   Other Resources (admin)

   Note the absence of any class / stream / subject / chapter field. That is
   not an oversight — an Other Resource has none, which is what keeps it from
   being attached to a purchase.
   ------------------------------------------------------------------ */

export interface AdminOtherResourceCategory {
  id: number
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  resource_count: number
  created_at: string
  updated_at: string
}

export interface AdminOtherResource {
  id: number
  category: number
  category_name: string
  title: string
  slug: string
  description: string
  /** Storage URL on read, a `File` on write. See `AdminContent.file`. */
  file: string | File | null
  file_name: string | null
  file_size: number | null
  page_count: number | null
  display_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

/* ---------------------------------------------------------------------
   Admin notifications
   ------------------------------------------------------------------ */

export type NotificationType =
  | 'NEW_STUDENT'
  | 'PAYMENT_REQUEST'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'CONTENT_PUBLISHED'
  | 'RESOURCE_PUBLISHED'
  | 'SYSTEM_ALERT'

export interface AdminNotification {
  id: number
  type: NotificationType
  /** Human-readable name for the type, e.g. "Payment request". */
  type_label: string
  title: string
  message: string
  /** Server-generated internal path, e.g. `/admin-panel/payments?payment=12`. */
  link: string
  is_read: boolean
  created_at: string
}

/** Tabs on the Notification Center page. */
export type NotificationGroup = 'all' | 'unread' | 'payments' | 'students' | 'system'

/* ---------------------------------------------------------------------
   Dependent dropdown options
   ------------------------------------------------------------------ */

/** Options for the dependent Class → Stream → Subject → Chapter dropdowns. */
export interface AcademicOption {
  id: number
  name: string
  slug: string
}

/** A class option, plus whether a stream must be chosen for it. */
export interface ClassOption extends AcademicOption {
  hasStreams: boolean
}

/**
 * A subject option, plus which class and stream it belongs to.
 *
 * `streamName` matters for Classes 11/12, where "Mathematics" legitimately
 * exists in every stream — without it the dropdown lists several identical
 * entries with no way to tell them apart.
 */
export interface SubjectOption extends AcademicOption {
  classSlug: string
  streamSlug: string | null
  streamName: string | null
}

/** `Mathematics — Science`, or just `Mathematics` when there is no stream. */
export function subjectOptionLabel(option: SubjectOption): string {
  return option.streamName ? `${option.name} — ${option.streamName}` : option.name
}

/** Shared query parameters for the admin list endpoints. */
export type AdminQuery = Record<string, string | number | undefined>