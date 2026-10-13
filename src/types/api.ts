/* ========================================================================
   API DTOs — wire shapes
   ---------------------------------------------------------------------
   These mirror the Django REST serializers exactly. Field names are
   snake_case because that is what the server sends; do not "tidy" them.

   Nothing here is trusted for an access decision. `is_locked` and
   `allowed` exist so the UI can render a lock badge, but the backend
   re-checks every rule on every request — see `ContentViewSet.document`.

   Kept separate from `src/types/index.ts` so a DTO rename is a
   compile-time error at the mapping layer rather than a silent runtime
   mismatch deep inside a component.
   =================================================================== */

/* ---------------------------------------------------------------------
   Errors
   ------------------------------------------------------------------ */

/** Shape of a DRF error body. Every field maps to a list of messages. */
export type ApiErrorBody = Record<string, string | string[]>

/* ---------------------------------------------------------------------
   Pagination
   ------------------------------------------------------------------
   The catalogue endpoints set `pagination_class = None` and return a bare
   array, while a few collection endpoints return `{ count, results }`.
   `PaginatedDto<T>` covers the second shape; `normaliseList` in
   `services/client.ts` collapses both into a plain array so callers never
   have to care.
   ------------------------------------------------------------------ */

export interface PaginatedDto<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** The `{ count, results }` shape used by `/my-classes/`. */
export interface CountedDto<T> {
  count: number
  results: T[]
}

/* ---------------------------------------------------------------------
   Accounts & auth
   ------------------------------------------------------------------ */

export interface UserDto {
  id: number
  email: string
  email_verified: boolean
  first_name: string
  last_name: string
  full_name: string
  avatar_url: string | null
  date_joined: string
}

export interface StudentProfileDto {
  /** Primary key of the selected class. */
  selected_class: number | null
  /** Class number 7-12, derived server-side. Null when none selected. */
  selected_class_number: number | null
  selected_class_name: string | null
  selected_stream: number | null
  selected_stream_name: string | null
  class_requires_stream: boolean
  phone_number: string
}

/** A class with an ACTIVE purchase. Never derived from the preference. */
export interface UnlockedClassDto {
  id: number
  number: number | null
  name: string
  stream: number | null
  stream_name: string | null
}

export interface AuthMeDto {
  authenticated: boolean
  user: UserDto | null
  profile: StudentProfileDto | null
  unlocked_classes: UnlockedClassDto[]
}

export interface ProfileDto {
  id: number
  email: string
  email_verified: boolean
  first_name: string
  last_name: string
  full_name: string
  avatar_url: string
  auth_provider: string
  profile: StudentProfileDto
  unlocked_classes: UnlockedClassDto[]
  has_access_to_selected_class: boolean
}

export interface AuthConfigDto {
  google_enabled: boolean
  login_url: string | null
  auth_provider?: string
  detail?: string
}

/* ---------------------------------------------------------------------
   Academics
   ------------------------------------------------------------------ */

export interface ClassLevelDto {
  id: number
  /** Class number 7-12, derived server-side. Null when the name has none. */
  number: number | null
  name: string
  slug: string
  description: string
  /** Decimal string, e.g. "199.00". Parsed once, in the mapper. */
  price: string
  display_price: string
  currency: string
  display_order: number
  has_streams: boolean
  is_active: boolean
  subject_count: number
}

export interface StreamDto {
  id: number
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  class_levels: number[]
}

export interface SubjectDto {
  id: number
  class_level: number
  class_level_name: string
  stream: number | null
  stream_name: string | null
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
  chapter_count: number
}

export interface ChapterDto {
  id: number
  subject: number
  subject_name: string
  /** Slug of the owning subject, so a client can build links in one hop. */
  subject_slug: string
  class_level: number
  number: number
  name: string
  slug: string
  description: string
  display_order: number
  is_active: boolean
}

/** Adds the published-material summary from `/subjects/{slug}/chapters/`. */
export interface ChapterWithContentsDto extends ChapterDto {
  content_count: number
  content_types: ContentTypeDto[]
}

/* ---------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */

/** Values must match `apps.content.models.ContentType`. */
export type ContentTypeDto =
  | 'NOTES'
  | 'PYQ'
  | 'SOLVED_PYQ'
  | 'IMPORTANT_QUESTIONS'
  | 'PRACTICE_PAPER'
  | 'MODEL_PAPER'

export interface ContentDto {
  id: number
  chapter: number
  chapter_name: string
  chapter_number: number
  /** Slugs of the owning chapter and subject, for breadcrumb links. */
  chapter_slug: string
  subject_name: string
  subject_slug: string
  class_level_id: number
  class_level_name: string
  title: string
  slug: string
  description: string
  content_type: ContentTypeDto
  content_type_label: string
  page_count: number | null
  display_order: number
  is_published: boolean
  /** Server-computed lock state. Display only; never authoritative. */
  is_locked: boolean
}

/** `GET /api/v1/contents/{slug}/access/` */
export interface ContentAccessDto {
  id: number
  class_level: number
  class_name: string
  allowed: boolean
  reason: string | null
}

/** `GET /api/v1/chapters/{slug}/contents/` */
export interface ChapterContentsDto {
  chapter: {
    id: number
    name: string
    number: number
    subject: string
    class_level: number
    class_name: string
  }
  has_access: boolean
  count: number
  results: ContentDto[]
}

/* ---------------------------------------------------------------------
   Other Resources

   A SECOND content system, independent of the class/stream/subject/chapter
   tree. These DTOs carry no class, stream, subject or chapter field, because
   the resource has none — and none of it is gated by a purchase.
   ------------------------------------------------------------------ */

export interface OtherResourceCategoryDto {
  id: number
  name: string
  slug: string
  description: string
  display_order: number
  /** Published resources in this category. */
  resource_count: number
}

export interface OtherResourceDto {
  id: number
  category: number
  category_name: string
  category_slug: string
  title: string
  slug: string
  description: string
  page_count: number | null
  display_order: number
  /** Generated storage filename (a UUID). Never a filesystem path. */
  file_name: string | null
  created_at: string
}

/* ---------------------------------------------------------------------
   Purchases
   ------------------------------------------------------------------ */

export type PurchaseStatusDto = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'CANCELLED'

export interface ClassPurchaseDto {
  id: number
  user: number
  class_level: number
  class_name: string
  stream: number | null
  stream_name: string | null
  /** Decimal string. The server decided this; the client never sent it. */
  amount: string
  currency: string
  status: PurchaseStatusDto
  status_label: string
  is_active: boolean
  activated_at: string | null
  approved_at: string | null
  approved_by_email: string | null
  created_at: string
  updated_at: string
}

/** `GET /api/v1/purchases/{id}/access/` */
export interface PurchaseAccessDto {
  purchase_id: number
  class_level: number
  class_name: string
  status: PurchaseStatusDto
  has_access: boolean
  message: string
}

/* ---------------------------------------------------------------------
   Payments (manual UPI — no gateway)
   ------------------------------------------------------------------ */

export interface UPISettingsDto {
  upi_id: string
  display_name: string
  qr_code_url: string | null
  instructions: string
}

/** `GET /api/v1/purchases/{id}/upi/` — server-built, server-priced. */
export interface UPIContextDto {
  reference: string
  upi_id: string
  display_name: string
  /**
   * Absolute path to the QR, or null.
   *
   * This endpoint spells the key `qr_code` (see
   * `apps.payments.services.build_upi_context`), while `/payments/upi/` spells
   * it `qr_code_url`. `qr_code_url` is read as well so the mapper tolerates
   * either spelling rather than silently rendering no QR at all, which is what
   * happened when only `qr_code_url` was declared.
   */
  qr_code: string | null
  qr_code_url?: string | null
  instructions: string
  amount: string
  currency: string
  class_name: string
  upi_uri: string
}

export type PaymentStatusDto = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface PaymentProofDto {
  id: number
  class_purchase: number
  class_name: string
  amount: string
  currency: string
  payment_method: string
  utr: string
  transaction_id: string
  status: PaymentStatusDto
  status_label: string
  submitted_at: string
  reviewed_at: string | null
  reviewed_by_email: string | null
  rejection_reason: string
  has_screenshot: boolean
}
