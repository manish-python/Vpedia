import type { ClassId, Purchase, StreamId } from '@/types'
import type {
  ClassPurchaseDto,
  ClassLevelDto,
  CountedDto,
  PurchaseAccessDto,
  StreamDto,
  UnlockedClassDto,
} from '@/types/api'
import { ApiError, get, getList, post } from './client'
import { classSlug, fetchClassLevelDto } from './classService'
import { toPurchase, toPurchaseStatus, toClassId } from './mappers'

/* ========================================================================
   Purchase service

   A purchase grants complete access to exactly one class. Class 11 and 12
   purchases also record the chosen stream.

   Three things this service will not do:

   • It will not seed a purchase. There is no local store and no demo row —
     the previous `sessionStorage` seed is gone, because a fake ACTIVE
     purchase is indistinguishable from a real one once a page reads it.
   • It will not accept an amount. `POST /purchases/` takes a class and a
     stream; the server reads the price and returns it. The UI displays the
     server's number, never a local one.
   • It will not treat PENDING as access. `unlock()` returns the record the
     server created, which is PENDING, and only `isPurchaseActive` — reading
     `status === 'success'` (i.e. ACTIVE) — reports access.
   =================================================================== */

/** GET /api/v1/purchases/my/ — the caller's own purchases, newest first. */
export async function fetchPurchases(signal?: AbortSignal): Promise<Purchase[]> {
  const dtos = await getList<ClassPurchaseDto>('/purchases/my/', signal)
  const mapped = await Promise.all(dtos.map(toPurchaseFromDto))
  // A purchase whose class cannot be resolved to a real class number is
  // dropped rather than attributed to a guessed one. Showing it under the
  // wrong class would be worse than not showing it: the student would see a
  // class they never bought, which is the exact bug this work removed.
  return mapped.filter((purchase): purchase is Purchase => purchase !== null)
}

/** As above, but without the class-number lookup. Useful for raw display. */
export async function fetchPurchaseDtos(signal?: AbortSignal): Promise<ClassPurchaseDto[]> {
  return getList<ClassPurchaseDto>('/purchases/my/', signal)
}

/**
 * `ClassPurchaseDto.class_level` is the server's primary key, while the UI
 * addresses classes by number. Resolving the number needs one extra lookup,
 * cached for the life of the session because class numbers never change.
 */
const classNumberById = new Map<number, ClassId>()

async function toPurchaseFromDto(dto: ClassPurchaseDto): Promise<Purchase | null> {
  let classId = classNumberById.get(dto.class_level)

  if (!classId) {
    // Derive the number from the class name the server sent, avoiding a
    // per-purchase request. There is no `: 7` fallback here on purpose: a class
    // name with no number in it is not Class 7, and inventing one would put an
    // unowned class on the student's dashboard.
    const byName = /(\d+)/.exec(dto.class_name ?? '')
    const number = byName ? toClassId(Number(byName[1])) : null
    if (!number) return null
    classId = number
    classNumberById.set(dto.class_level, classId)
  }

  return toPurchase(dto, classId)
}

/** Warm the class-id → class-number cache for the classes in the catalogue. */
export async function primeClassNumbers(signal?: AbortSignal): Promise<void> {
  const dtos = await getList<ClassLevelDto>('/classes/', signal)
  for (const dto of dtos) {
    const number = toClassId(dto.number)
    if (number !== null) classNumberById.set(dto.id, number)
  }
}

/** GET /api/v1/my-classes/ — classes with an ACTIVE purchase. */
export async function fetchUnlockedClasses(
  signal?: AbortSignal,
): Promise<UnlockedClassDto[]> {
  const payload = await get<CountedDto<UnlockedClassDto>>('/my-classes/', signal)
  return payload?.results ?? []
}

/** The most recent purchase for a class, if any. */
export async function fetchPurchaseForClass(
  classId: ClassId,
  signal?: AbortSignal,
): Promise<Purchase | null> {
  const purchases = await fetchPurchases(signal)
  const matches = purchases.filter((purchase) => purchase.classId === classId)
  return matches[0] ?? null
}

/** GET /api/v1/purchases/{id}/access/ — the server's entitlement answer. */
export async function fetchPurchaseAccess(
  purchaseId: string | number,
  signal?: AbortSignal,
): Promise<PurchaseAccessDto | null> {
  try {
    return await get<PurchaseAccessDto>(`/purchases/${purchaseId}/access/`, signal)
  } catch {
    return null
  }
}

export interface CreatePurchaseInput {
  classId: ClassId
  streamId: StreamId | null
}

/**
 * POST /api/v1/purchases/ — opens a purchase request.
 *
 * The returned record is PENDING. That is a *request*, not a payment and not
 * an entitlement: the student still has to pay over UPI and an administrator
 * still has to approve.
 *
 * No amount is sent. `PurchaseRequestSerializer` has no amount field, so a
 * client cannot ask for Class 12 at ₹1 — and if it tries, the extra key is
 * rejected outright.
 */
export async function createPurchase(
  input: CreatePurchaseInput,
  signal?: AbortSignal,
): Promise<Purchase> {
  const classLevel = await fetchClassLevelDto(input.classId, signal)
  if (!classLevel) {
    throw new ApiError('That class is not available right now.', 404)
  }

  let streamPk: number | null = null
  if (input.streamId) {
    const streams = await getList<StreamDto>('/streams/', signal)
    streamPk = streams.find((s) => s.slug === input.streamId)?.id ?? null
    if (streamPk === null) {
      throw new ApiError('Please choose a valid stream.', 400)
    }
  }

  const classId = (toClassId(classLevel.number) ?? input.classId) as ClassId

  let dto: ClassPurchaseDto
  try {
    dto = await post<ClassPurchaseDto>(
      '/purchases/',
      { class_level: classLevel.id, stream: streamPk },
      signal,
    )
  } catch (cause) {
    // 409 means this class already has an open purchase request.
    //
    // Re-opening the payment page is the normal thing for a student to do: pay
    // in their UPI app, come back, submit the proof. Treating the conflict as a
    // failure meant the caller received null, built `/purchases/NaN/upi/`, got
    // a 404 and rendered "UPI details unavailable" - the reported bug.
    //
    // So re-read the existing record and carry on with it. Nothing is created,
    // approved or unlocked here; the already-open PENDING purchase is simply
    // the right one to pay against.
    if (cause instanceof ApiError && cause.status === 409) {
      const purchases = await fetchPurchases(signal)
      const forClass = purchases.filter((purchase) => purchase.classId === classId)
      // Prefer the record that can still accept a proof. A REJECTED or
      // CANCELLED purchase cannot, so paying against it would fail again.
      const open =
        forClass.find((purchase) => purchase.status === 'pending') ??
        forClass.find((purchase) => purchase.status === 'not_purchased') ??
        forClass[0] ??
        null
      if (open) return open
    }
    throw cause
  }

  classNumberById.set(dto.class_level, classId)

  return toPurchase(dto, classId)
}

/** The most recent purchase overall, used by the payment result screens. */
export async function fetchLatestPurchase(
  classId?: ClassId,
  signal?: AbortSignal,
): Promise<Purchase | null> {
  const purchases = await fetchPurchases(signal)
  const first = purchases[0]
  if (!first) return null
  if (classId === undefined) return first
  return purchases.find((purchase) => purchase.classId === classId) ?? null
}

/** True only for an ACTIVE purchase. PENDING is deliberately not access. */
export function isPurchaseActive(purchase: Purchase | null | undefined): boolean {
  return purchase?.status === 'success'
}

export { toPurchaseStatus, classSlug }
