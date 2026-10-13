import type { ClassId, LibraryClassEntry, SearchHit } from '@/types'
import type { ChapterDto, ClassLevelDto, ContentDto, StreamDto, SubjectDto } from '@/types/api'
import { getList, qs } from './client'
import { fetchClasses } from './classService'
import { toClassId, toContentType, toVClass } from './mappers'

/* ========================================================================
   Library & search

   The library is composed from the catalogue the backend already serves —
   classes, subjects, chapters, content — rather than a purpose-built
   endpoint. That keeps the backend unchanged and means the numbers here are
   the same numbers every other page shows.

   Search runs against real API rows. The previous build-it-locally-from-
   fixtures index is gone: an index over sample data would answer "no
   results" for anything real, which is worse than no search at all.
   =================================================================== */

/* ---------------------------------------------------------------------
   Library
   ------------------------------------------------------------------ */

/**
 * GET /api/v1/classes/ — the catalogue, annotated with ownership.
 *
 * `unlockedClassNumbers` are class *numbers* (7-12), the same vocabulary the
 * rest of the UI uses, because `PurchaseContext` derives them from the
 * backend's purchase records. They are compared against `ClassLevelDto.number`,
 * never against `ClassLevelDto.id` — that is the database primary key, and
 * comparing a 10 against a 4 silently reports every purchased class as
 * unpurchased.
 *
 * `materialCount` is the number of published content rows in that class.
 */
export async function fetchLibrary(
  unlockedClassNumbers: readonly number[],
  signal?: AbortSignal,
): Promise<LibraryClassEntry[]> {
  const classDtos = await getList<ClassLevelDto>('/classes/', signal)

  const entries: LibraryClassEntry[] = []

  for (const [index, dto] of classDtos.entries()) {
    const classNumber = toClassId(dto.number)
    if (classNumber === null) continue

    const rows = await getList<ContentDto>(`/contents/${qs({ class: dto.slug })}`, signal)

    entries.push({
      classId: classNumber as ClassId,
      vClass: toVClass(dto, index),
      materialCount: rows.length,
      isPurchased: unlockedClassNumbers.includes(classNumber),
      purchasedAt: null,
      price: Number.parseFloat(dto.price) || 0,
    })
  }

  return entries
}

/** No bookmark feature exists yet, so the count is honestly zero. */
export async function fetchSavedMaterialCount(): Promise<number> {
  return 0
}

/* ---------------------------------------------------------------------
   Search

   Searches the real catalogue across subjects, chapters and content.
   The backend has no search endpoint, so this composes three supported
   queries and filters client-side. That is a superset of searching one
   loaded mock array: the rows come from PostgreSQL, so a chapter published
   this morning is findable immediately.

   Results are capped and every query runs with the same abort signal, so a
   fast typist does not queue five overlapping requests.
   ------------------------------------------------------------------ */

const SEARCH_LIMIT = 40

export async function search(
  query: string,
  unlockedClassNumbers: readonly number[],
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const term = query.trim().toLowerCase()
  if (term.length < 2) return []

  const [classDtos, subjectDtos, chapterDtos, contentDtos] = await Promise.all([
    getList<ClassLevelDto>('/classes/', signal),
    getList<SubjectDto>('/subjects/', signal),
    getList<ChapterDto>('/chapters/', signal),
    getList<ContentDto>('/contents/', signal),
  ])

  const classNumberById = new Map<number, number | null>()
  const classNameById = new Map<number, string>()
  for (const dto of classDtos) {
    classNumberById.set(dto.id, dto.number)
    classNameById.set(dto.id, dto.name)
  }

  // The caller supplies class numbers (7-12), while `dto.id` is the opaque
  // database primary key. Compare like with like or every search result would
  // be reported as locked.
  const unlockedNumbers = new Set<number>(
    classDtos
      .map((dto) => toClassId(dto.number))
      .filter((number): number is ClassId =>
        number !== null && unlockedClassNumbers.includes(number),
      ),
  )

  const subjectById = new Map<number, SubjectDto>()
  for (const dto of subjectDtos) subjectById.set(dto.id, dto)

  const hits: SearchHit[] = []

  for (const dto of subjectDtos) {
    if (!matches(dto.name, term)) continue
    const classNumber = toClassId(classNumberById.get(dto.class_level) ?? null)
    if (classNumber === null) continue

    hits.push({
      id: dto.slug,
      kind: 'subject',
      title: dto.name,
      subtitle: `${dto.chapter_count} chapters · ${classNameById.get(dto.class_level) ?? ''}`,
      classId: classNumber,
      subjectName: dto.name,
      chapterName: null,
      contentType: null,
      isLocked: !unlockedNumbers.has(classNumber),
      href: `/classes/${classNumber}/subjects/${dto.slug}/chapters`,
    })
  }

  for (const dto of chapterDtos) {
    if (!matches(dto.name, term) && !matches(dto.description, term)) continue
    const subject = subjectById.get(dto.subject)
    if (!subject) continue
    const classNumber = toClassId(classNumberById.get(subject.class_level) ?? null)
    if (classNumber === null) continue

    hits.push({
      id: dto.slug,
      kind: 'chapter',
      title: dto.name,
      subtitle: `${classNameById.get(subject.class_level) ?? ''} · ${subject.name}`,
      classId: classNumber,
      subjectName: subject.name,
      chapterName: dto.name,
      contentType: null,
      isLocked: !unlockedNumbers.has(classNumber),
      href: `/chapters/${dto.slug}/content`,
    })
  }

  for (const dto of contentDtos) {
    if (!matches(dto.title, term)) continue
    const classNumber = toClassId(dto.class_level_id)
    if (classNumber === null) continue

    hits.push({
      id: dto.slug,
      kind: 'content',
      title: dto.title,
      subtitle: `${dto.class_level_name} · ${dto.subject_name}`,
      classId: classNumber,
      subjectName: dto.subject_name,
      chapterName: dto.chapter_name,
      contentType: toContentType(dto.content_type),
      // Mirrors the server's own `is_locked`, so search never shows something
      // the content page would then refuse.
      isLocked: dto.is_locked,
      href: `/notes/${dto.slug}`,
    })
  }

  return hits.slice(0, SEARCH_LIMIT)
}

function matches(haystack: string | null | undefined, term: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(term)
}

/** Streams for the library filter chips. */
export async function fetchLibraryStreams(signal?: AbortSignal): Promise<StreamDto[]> {
  return getList<StreamDto>('/streams/', signal)
}

/** Re-exported so a page can build a class link without importing two services. */
export { fetchClasses }
