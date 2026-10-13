/* ========================================================================
   VPEDIA LEARNING — Domain types
   Single source of truth for every shape in the product.
   ===================================================================== */

/* ---------------------------------------------------------------------
   Branded / primitive helpers
   ------------------------------------------------------------------ */

export type ClassId = 7 | 8 | 9 | 10 | 11 | 12

export type StreamId = 'science' | 'commerce' | 'humanities'

/**
 * Content kinds the platform serves. A single discriminated union keeps the
 * content system reusable — no per-type components.
 */
export type ContentType =
  | 'NOTES'
  | 'PYQ'
  | 'SOLVED_PYQ'
  | 'IMPORTANT_QUESTIONS'
  | 'PRACTICE_PAPER'
  | 'MODEL_PAPER'

/* ---------------------------------------------------------------------
   User & auth
   ------------------------------------------------------------------ */

export interface User {
  id: string
  name: string
  email: string
  /** URL of the Google-provided avatar. Null when the backend has none yet. */
  avatarUrl: string | null
  /**
   * Class the student is currently studying. Drives dashboard context.
   *
   * Null until they pick one. It is never defaulted to a class: guessing
   * "Class 7" for someone who chose nothing renders a confident, wrong answer.
   * A preference only — it does not grant access to anything.
   */
  currentClassId: ClassId | null
  joinedAt: string // ISO-8601
  /** Where the student is in the onboarding funnel. */
  status: 'new' | 'active' | 'returning'
}

/**
 * The student's class/stream preference, mirrored from
 * `GET /api/v1/profile/me/`.
 *
 * IMPORTANT: this is a preference only. It records what the student is
 * studying and shapes the dashboard. It never grants access to material — that
 * comes from an approved `ClassPurchase`, and `unlockedClasses` is the honest
 * list of what they have paid for.
 */
export interface StudentProfile {
  selectedClassId: number | null
  selectedClassName: string | null
  selectedStreamId: number | null
  selectedStreamName: string | null
  /** True for classes that must be paired with a stream (11 and 12). */
  classRequiresStream: boolean
  phoneNumber: string
}

/** A class the student has actually paid for, from an approved purchase. */
export interface UnlockedClass {
  id: number
  name: string
  stream: number | null
  streamName: string | null
}

/** Shape of `GET /api/v1/auth/me/`. */
export interface AuthMeResponse {
  authenticated: boolean
  user: {
    id: number
    email: string
    email_verified: boolean
    first_name: string
    last_name: string
    full_name: string
    avatar_url: string | null
    date_joined: string
  } | null
  profile: {
    selected_class: number | null
    selected_class_number: number | null
    selected_class_name: string | null
    selected_stream: number | null
    selected_stream_name: string | null
    class_requires_stream: boolean
    phone_number: string
  } | null
  unlocked_classes: UnlockedClass[]
}

/** Shape of `GET /api/v1/auth/config/`. */
export interface AuthConfigResponse {
  google_enabled: boolean
  login_url: string | null
  auth_provider?: string
  detail?: string
}

export type AuthStatus = 'unauthenticated' | 'authenticating' | 'authenticated' | 'error'

export interface AuthState {
  status: AuthStatus
  user: User | null
  error: string | null
  /**
   * True until the initial session check finishes.
   *
   * Without this, `status` starts as `unauthenticated` and a protected route
   * would redirect to the login screen before the stored session had a chance
   * to load. Guards must wait for this flag, not for `status`.
   */
  isRestoring: boolean
}

/* ---------------------------------------------------------------------
   Catalogue
   ------------------------------------------------------------------ */

export interface Stream {
  id: StreamId
  name: string
  description: string
}

export interface VClass {
  id: ClassId
  /** e.g. "Class 10" */
  name: string
  /** Short label used on tiles, e.g. "10" */
  shortLabel: string
  /** Whole-rupee price. Placeholder until the backend is the source of truth. */
  price: number
  tagline: string
  description: string
  /** Feature bullets shown on the class details page. */
  features: string[]
  isPopular: boolean
  /** Classes 11 and 12 must ask for a stream before subjects are listed. */
  hasStreams: boolean
  /** Tailwind class fragments driving the tile artwork. */
  accent: AccentKey
}

export interface Subject {
  id: string
  classId: ClassId
  /** Populated for Class 11 / 12 only. */
  streamId: StreamId | null
  name: string
  shortName: string
  chapterCount: number
  icon: SubjectIconKey
  accent: AccentKey
}

export interface Chapter {
  id: string
  subjectId: string
  number: number
  name: string
  /** Short line shown under the chapter title in lists. */
  blurb: string
}

export interface ContentItem {
  id: string
  chapterId: string
  title: string
  type: ContentType
  /**
   * Pages in the attached PDF, or `null` when the backend could not determine
   * it. Never `0`: an unknown count is not a document with no pages.
   */
  pageCount: number | null
  description: string
  /**
   * Resolved at runtime from the student's purchases — never trusted from
   * the payload itself. The backend stays the final authority.
   */
  isLocked: boolean
}

/** A content item decorated with the breadcrumbs needed to render it. */
export interface ResolvedContent extends ContentItem {
  chapter: Chapter
  subject: Subject
  vClass: VClass
}

/* ---------------------------------------------------------------------
   Purchase & payment
   ------------------------------------------------------------------ */

export type PurchaseStatus = 'not_purchased' | 'pending' | 'success' | 'failed' | 'cancelled'

/**
 * One purchase record, mirrored from the backend.
 *
 * `status` maps the server's vocabulary:
 *   ACTIVE    → 'success'    (access granted)
 *   PENDING   → 'pending'    (payment awaiting admin verification)
 *   REJECTED  → 'failed'
 *   CANCELLED → 'cancelled'
 *
 * Only 'success' unlocks anything, and only because the backend said so.
 */
export interface Purchase {
  id: string
  userId: string
  classId: ClassId
  /** Populated when a stream is required for 11 / 12. */
  streamId: StreamId | null
  /** Decimal amount decided by the server. Never computed in the browser. */
  amount: number
  currency: 'INR'
  status: PurchaseStatus
  /** Server row creation time. Used to decide which of several rows is newest. */
  createdAt: string
  /** When access was activated by an administrator. */
  purchasedAt: string | null
  /** Always null: access does not expire. Kept for the UI's shape. */
  expiresAt: string | null
}

/* ---------------------------------------------------------------------
   Manual UPI payment

   Payment is collected over UPI outside this application: the student scans
   the QR or uses the UPI ID in their own app, then returns and submits proof.
   There is no gateway, no order, and no client-side confirmation.

   These types mirror `apps/payments/serializers.py`.
   ------------------------------------------------------------------ */

/** Status of a submitted payment proof. */
export type ProofStatus = 'pending' | 'approved' | 'rejected'

export interface PaymentProof {
  id: string
  purchaseId: string
  className: string
  amount: number
  currency: 'INR'
  utr: string
  transactionId: string
  status: ProofStatus
  statusLabel: string
  submittedAt: string
  reviewedAt: string | null
  reviewedByEmail: string | null
  rejectionReason: string
}

/** Live UPI configuration, always read from the backend. */
export interface UPIConfig {
  upiId: string
  displayName: string
  qrCodeUrl: string | null
  instructions: string
}

/** Everything needed to collect one purchase, built by the server. */
export interface UPIContext extends UPIConfig {
  /** e.g. "VP000042" — echoed by the student's UPI app as the note. */
  reference: string
  amount: number
  currency: 'INR'
  className: string
  /** Standard `upi://pay?…` URI. Opening it proves nothing. */
  upiUri: string
}

/* ---------------------------------------------------------------------
   Library & notifications
   ------------------------------------------------------------------ */

export type LibraryTab = 'all' | 'notes' | 'pyqs' | 'practice'

export interface LibraryClassEntry {
  classId: ClassId
  vClass: VClass
  materialCount: number
  isPurchased: boolean
  purchasedAt: string | null
  price: number
}

export type NotificationKind = 'new_content' | 'purchase' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
  href: string | null
}

/* ---------------------------------------------------------------------
   Search
   ------------------------------------------------------------------ */

export type SearchEntityKind = 'subject' | 'chapter' | 'content'

export interface SearchHit {
  id: string
  kind: SearchEntityKind
  title: string
  subtitle: string
  classId: ClassId
  subjectName: string
  chapterName: string | null
  contentType: ContentType | null
  isLocked: boolean
  href: string
}

/* ---------------------------------------------------------------------
   Transport envelopes
   ------------------------------------------------------------------ */

export interface ApiResponse<T> {
  data: T
  message: string
  status: number
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

/* ---------------------------------------------------------------------
   Presentation keys
   ------------------------------------------------------------------ */

export type AccentKey =
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'pink'
  | 'sky'
  | 'violet'
  | 'amber'

export type SubjectIconKey =
  | 'calculator'
  | 'flask'
  | 'book-open'
  | 'globe'
  | 'languages'
  | 'monitor'
  | 'landmark'
  | 'chart'
  | 'microscope'
  | 'scale'
  | 'compass'
  | 'palette'
  | 'coins'
  | 'landmark-bank'
  | 'brain'
  | 'pen-tool'

export type IllustrationKey =
  | 'hero'
  | 'login'
  | 'dashboard'
  | 'success'
  | 'empty'
  | 'not-found'
  | 'locked'
  | 'search'
