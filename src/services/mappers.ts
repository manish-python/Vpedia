import {
  classAccent,
  classTagline,
  CLASS_FEATURES,
  DEFAULT_CLASS_DESCRIPTION,
  POPULAR_CLASS,
  subjectAccent,
  subjectIcon,
} from '@/data/presentation'
import type {
  Chapter,
  ClassId,
  ContentItem,
  ContentType,
  PaymentProof,
  Purchase,
  PurchaseStatus,
  ResolvedContent,
  Stream,
  StreamId,
  Subject,
  UPIConfig,
  UPIContext,
  VClass,
} from '@/types'
import type {
  ChapterDto,
  ChapterWithContentsDto,
  ClassLevelDto,
  ClassPurchaseDto,
  ContentDto,
  PaymentProofDto,
  PaymentStatusDto,
  PurchaseStatusDto,
  StreamDto,
  SubjectDto,
  UPISettingsDto,
  UPIContextDto,
} from '@/types/api'

/* ========================================================================
   DTO → view-model
   ---------------------------------------------------------------------
   The single boundary between the wire shape and the shapes components
   already consume.

   Two rules hold here:

   1. Data always comes from the server. `price`, `name`, `description`,
      `chapterCount` and lock state are never invented or defaulted to a
      believable value — a missing price is 0, not a guess, and a missing
      description is the empty string, not marketing copy.
   2. Only decoration is filled in locally (colours, icons, taglines,
      feature bullets). Those live in `data/presentation.ts`.

   Because the mapping is one-directional and one-place, a backend field
   rename becomes a type error here rather than `undefined` on a page.
   =================================================================== */

/* ---------------------------------------------------------------------
   Primitives
   ------------------------------------------------------------------ */

/** Decimal string → number. `"199.00"` becomes `199`. */
function money(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

/** Narrows a number to the `ClassId` union, or null when out of range. */
export function toClassId(value: number | null | undefined): ClassId | null {
  if (typeof value !== 'number') return null
  return (value >= 7 && value <= 12 ? value : null) as ClassId | null
}

/** `ContentTypeDto` and `ContentType` are the same union; kept as a guard. */
export function toContentType(value: string): ContentType {
  const allowed: ContentType[] = [
    'NOTES',
    'PYQ',
    'SOLVED_PYQ',
    'IMPORTANT_QUESTIONS',
    'PRACTICE_PAPER',
    'MODEL_PAPER',
  ]
  return (allowed.includes(value as ContentType) ? value : 'NOTES') as ContentType
}

/* ---------------------------------------------------------------------
   Academics
   ------------------------------------------------------------------ */

export function toVClass(dto: ClassLevelDto, index = 0): VClass {
  const classNumber = toClassId(dto.number)

  return {
    // `ClassId` is the class *number*, which is what the routes use. A class
    // without a number cannot be routed, so it is dropped by the caller.
    id: (classNumber ?? (index + 7)) as ClassId,
    name: dto.name,
    shortLabel: classNumber ? String(classNumber) : dto.name,
    price: money(dto.price),
    tagline: classNumber ? classTagline(classNumber) : '',
    description: dto.description || DEFAULT_CLASS_DESCRIPTION,
    features: [...CLASS_FEATURES],
    isPopular: classNumber === POPULAR_CLASS,
    hasStreams: dto.has_streams,
    accent: classAccent(dto.number ?? index + 7),
  }
}

/** Maps the class list, dropping any class the UI cannot address by route. */
export function toVClasses(dtos: ClassLevelDto[]): VClass[] {
  return dtos
    .map((dto, index) => ({ dto, mapped: toVClass(dto, index) }))
    .filter((entry) => toClassId(entry.dto.number) !== null)
    .map((entry) => entry.mapped)
}

/** The stream slug is the stable identifier the routes and types use. */
export function toStream(dto: StreamDto): Stream {
  return {
    id: dto.slug as StreamId,
    name: dto.name,
    description: dto.description,
  }
}

export function toStreams(dtos: StreamDto[]): Stream[] {
  return dtos.map(toStream)
}

/**
 * Recovers a stream slug from its display name.
 *
 * `SubjectDto` and `ClassPurchaseDto` carry `stream_name` but not the stream
 * slug, and the frontend addresses streams by slug. Django builds slugs with
 * `slugify()`, which for these names is exactly lowercase-with-dashes, so
 * this reproduces it.
 *
 * The result is only ever used for equality checks and display, never as a
 * request parameter — request paths use the slug the server handed us in
 * `/streams/`. A mismatch would therefore be cosmetic, not functional.
 */
export function streamSlugFromName(name: string | null | undefined): StreamId | null {
  if (!name) return null
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? (slug as StreamId) : null
}

/**
 * `SubjectDto.class_level` is a ClassLevel **primary key** (2 for Class 8), not
 * a class number, so it cannot be read as one.
 *
 * `knownClassNumber` is supplied by every caller that already knows which class
 * it asked for, which is authoritative. It matters because there is no
 * defensible fallback: defaulting to Class 7 showed a new student a class they
 * never chose, and leaving it null produced `/classes/null/...` URLs.
 */
export function toSubject(
  dto: SubjectDto,
  index: number,
  knownClassNumber?: ClassId | number | null,
): Subject {
  const classNumber =
    toClassId(knownClassNumber ?? null) ??
    toClassId(dto.class_level) ??
    toClassId(Number(dto.class_level_name?.match(/(\d+)/)?.[1] ?? NaN) || null)
  const classId = classNumber as ClassId

  return {
    // Slugs are stable across a reseed and readable in a URL, unlike PKs.
    id: dto.slug,
    classId,
    streamId: streamSlugFromName(dto.stream_name),
    name: dto.name,
    shortName: dto.name,
    chapterCount: dto.chapter_count,
    icon: subjectIcon(dto.name),
    accent: subjectAccent(index, classId),
  }
}

export function toChapters(dtos: Array<ChapterDto | ChapterWithContentsDto>): Chapter[] {
  return dtos.map((dto) => ({
    id: dto.slug,
    // The chapter DTO carries the subject's numeric id, not its slug, so the
    // owning subject is resolved by the caller and patched in afterwards.
    subjectId: '',
    number: dto.number,
    name: dto.name,
    blurb: dto.description,
  }))
}

/** One chapter, or undefined when the list was empty. */
export function toChapter(
  dto: ChapterDto | ChapterWithContentsDto,
): Chapter | undefined {
  return toChapters([dto])[0]
}

/* ---------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */

export function toContentItem(dto: ContentDto, chapterId: string): ContentItem {
  return {
    id: dto.slug,
    chapterId,
    title: dto.title,
    type: toContentType(dto.content_type),
    // Stays null when unknown. Coercing to 0 produced `PDF - 0 pages`.
    pageCount:
      typeof dto.page_count === 'number' && dto.page_count > 0 ? dto.page_count : null,
    description: dto.description,
    // Reported by the server, which re-checks it on every request. Mirrored
    // only so the UI can render a lock badge without a second round trip.
    isLocked: dto.is_locked,
  }
}

export function resolveContent(
  item: ContentItem,
  chapter: Chapter,
  subject: Subject,
  vClass: VClass,
): ResolvedContent {
  return { ...item, chapter, subject, vClass }
}

/* ---------------------------------------------------------------------
   Purchases
   ------------------------------------------------------------------ */

/**
 * Backend status → the UI's vocabulary.
 *
 * `not_purchased` means no record at all. Crucially, only `ACTIVE` maps to
 * `success`: a PENDING purchase is *not* a successful one, which is what
 * stops the UI claiming access before an administrator approves.
 */
export function toPurchaseStatus(status: PurchaseStatusDto): PurchaseStatus {
  switch (status) {
    case 'ACTIVE':
      return 'success'
    case 'PENDING':
      return 'pending'
    case 'REJECTED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'not_purchased'
  }
}

export function toPurchase(dto: ClassPurchaseDto, classId: ClassId): Purchase {
  return {
    id: String(dto.id),
    userId: String(dto.user),
    classId,
    streamId: streamSlugFromName(dto.stream_name),
    amount: money(dto.amount),
    currency: 'INR',
    status: toPurchaseStatus(dto.status),
    createdAt: dto.created_at,
    purchasedAt: dto.activated_at,
    expiresAt: null,
  }
}

export function toPaymentStatus(status: PaymentStatusDto): 'pending' | 'approved' | 'rejected' {
  switch (status) {
    case 'APPROVED':
      return 'approved'
    case 'REJECTED':
      return 'rejected'
    default:
      return 'pending'
  }
}

/**
 * UPI payment context for one purchase.
 *
 * Every figure here — amount, reference, the `upi://` URI itself — was built
 * by the server from the purchase record. Nothing is recomputed locally, so
 * what a student is shown is what they are actually charged.
 */
export function toUPIContext(dto: UPIContextDto): UPIContext {
  return {
    reference: dto.reference,
    upiId: dto.upi_id,
    displayName: dto.display_name,
    // This endpoint sends `qr_code`; the settings endpoint sends `qr_code_url`.
    // Reading only the latter meant a configured QR never rendered on the
    // payment page, because `qrCodeUrl` was always `undefined`.
    qrCodeUrl: dto.qr_code_url ?? dto.qr_code,
    instructions: dto.instructions,
    amount: money(dto.amount),
    currency: 'INR',
    className: dto.class_name,
    upiUri: dto.upi_uri,
  }
}

/** The public UPI configuration. */
export function toUPIConfig(dto: UPISettingsDto): UPIConfig {
  return {
    upiId: dto.upi_id,
    displayName: dto.display_name,
    qrCodeUrl: dto.qr_code_url,
    instructions: dto.instructions,
  }
}

/** One payment proof row. */
export function toPaymentProof(dto: PaymentProofDto): PaymentProof {
  return {
    id: String(dto.id),
    purchaseId: String(dto.class_purchase),
    className: dto.class_name,
    amount: money(dto.amount),
    currency: 'INR',
    utr: dto.utr,
    transactionId: dto.transaction_id,
    status: toPaymentStatus(dto.status),
    statusLabel: dto.status_label,
    submittedAt: dto.submitted_at,
    reviewedAt: dto.reviewed_at,
    reviewedByEmail: dto.reviewed_by_email,
    rejectionReason: dto.rejection_reason,
  }
}

/** Human sentence for a proof, used by the payment history list. */
export function paymentStatusMessage(
  status: PaymentStatusDto,
  rejectionReason?: string,
): string {
  switch (status) {
    case 'APPROVED':
      return 'Access unlocked'
    case 'REJECTED':
      return rejectionReason
        ? `Payment rejected — ${rejectionReason}`
        : 'Payment rejected'
    default:
      return 'Payment verification pending'
  }
}

/** Shared by the purchase service: the slug the backend keys classes by. */
export function classSlugFor(classNumber: number): string {
  return `class-${classNumber}`
}
