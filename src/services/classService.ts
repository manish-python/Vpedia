import type { ClassId, Stream, VClass } from '@/types'
import type { ClassLevelDto, StreamDto } from '@/types/api'
import { get, getList, qs } from './client'
import { toStream, toStreams, toVClass, toVClasses, toClassId } from './mappers'

/* ========================================================================
   Class & stream service — public catalogue, no authentication required.

   Source of truth: the API. `data/classes.ts` no longer holds names or
   prices; only presentation remains in `data/presentation.ts`.
   =================================================================== */

/** Slug form used in every catalogue path. */
export function classSlug(classNumber: number): string {
  return `class-${classNumber}`
}

/** GET /api/v1/classes/ — active, purchasable classes in display order. */
export async function fetchClasses(signal?: AbortSignal): Promise<VClass[]> {
  const dtos = await getList<ClassLevelDto>('/classes/', signal)
  return toVClasses(dtos)
}

/**
 * GET /api/v1/classes/{slug}/ — one class.
 *
 * Returns undefined rather than throwing for an unknown class so a stale
 * deep link renders the existing "not found" screen instead of an error
 * toast.
 */
export async function fetchClassById(
  classId: ClassId | number,
  signal?: AbortSignal,
): Promise<VClass | undefined> {
  try {
    const dto = await get<ClassLevelDto>(`/classes/${classSlug(Number(classId))}/`, signal)
    if (toClassId(dto.number) === null) return undefined
    return toVClass(dto)
  } catch {
    return undefined
  }
}

/** Raw class DTO, for callers that need the server-side `id` for a purchase. */
export async function fetchClassLevelDto(
  classId: ClassId | number,
  signal?: AbortSignal,
): Promise<ClassLevelDto | null> {
  try {
    return await get<ClassLevelDto>(`/classes/${classSlug(Number(classId))}/`, signal)
  } catch {
    return null
  }
}

/**
 * GET /api/v1/streams/?class={slug}
 *
 * Only classes that actually offer streams return anything, so a caller can
 * pass any class number and let an empty list mean "no streams here" rather
 * than branching on the frontend.
 */
export async function fetchStreams(
  classId?: ClassId | number | null,
  signal?: AbortSignal,
): Promise<Stream[]> {
  const path = classId ? `/streams/${qs({ class: classSlug(Number(classId)) })}` : '/streams/'
  const dtos = await getList<StreamDto>(path, signal)
  return toStreams(dtos)
}

/** One stream by slug. */
export async function fetchStreamById(
  streamId: string | null | undefined,
  signal?: AbortSignal,
): Promise<Stream | undefined> {
  if (!streamId) return undefined
  try {
    const dtos = await getList<StreamDto>(`/streams/${qs({ class: '' })}`, signal)
    const match = dtos.find((dto) => dto.slug === streamId)
    return match ? toStream(match) : undefined
  } catch {
    return undefined
  }
}
