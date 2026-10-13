import type { Chapter, ClassId, StreamId, Subject } from '@/types'
import type { ChapterDto, ChapterWithContentsDto, SubjectDto } from '@/types/api'
import { get, getList, qs } from './client'
import { classSlug } from './classService'
import { toChapter, toChapters, toSubject } from './mappers'

/* ========================================================================
   Subject & chapter service

   Reads from the academic endpoints that already exist:
     GET /api/v1/subjects/?class=&stream=
     GET /api/v1/subjects/{slug}/
     GET /api/v1/subjects/{slug}/chapters/
     GET /api/v1/chapters/?subject=&class=

   Slugs are used as route ids because they survive a reseed, unlike the
   numeric primary keys.

   `subjectId` on a chapter is filled in by the caller that already knows the
   owning subject; the chapter DTO only carries the subject's numeric id.
   =================================================================== */

/** GET /api/v1/subjects/ — filtered by class, and by stream when given. */
export async function fetchSubjects(
  classId: ClassId | number,
  streamId?: StreamId | string | null,
  signal?: AbortSignal,
): Promise<Subject[]> {
  const path = `/subjects/${qs({
    class: classSlug(Number(classId)),
    stream: streamId ?? undefined,
  })}`
  const dtos = await getList<SubjectDto>(path, signal)
  // The request was scoped to this class, so its number is authoritative for
  // every row returned - and it is a number, unlike the DTO's primary key.
  return dtos.map((dto, index) => toSubject(dto, index, Number(classId)))
}

/** GET /api/v1/subjects/{slug}/ — one subject, or undefined when unknown. */
export async function fetchSubjectById(
  subjectSlug: string,
  signal?: AbortSignal,
): Promise<Subject | undefined> {
  try {
    const dto = await get<SubjectDto>(`/subjects/${subjectSlug}/`, signal)
    return toSubject(dto, 0)
  } catch {
    return undefined
  }
}

/**
 * GET /api/v1/subjects/{slug}/chapters/ — chapters with published counts.
 *
 * The owning subject slug is stamped onto every chapter so `chapter.subjectId`
 * is always populated, which several list views rely on for breadcrumbing.
 */
export async function fetchChapters(
  subjectSlug: string,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  const dtos = await getList<ChapterWithContentsDto>(`/subjects/${subjectSlug}/chapters/`, signal)
  return toChapters(dtos).map((chapter) => ({ ...chapter, subjectId: subjectSlug }))
}

/**
 * GET /api/v1/chapters/?class= — every chapter in a class.
 *
 * Used by search and the library, which work across subjects. Returns an
 * empty list for a class the caller has no purchase for: the endpoint only
 * lists active chapters, and content access is enforced separately.
 */
export async function fetchChaptersForClass(
  classId: ClassId | number,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  const dtos = await getList<ChapterDto>(
    `/chapters/${qs({ class: classSlug(Number(classId)) })}`,
    signal,
  )
  return toChapters(dtos)
}

/** GET /api/v1/chapters/?subject={slug} — flat chapter list for a subject. */
export async function fetchChaptersBySubject(
  subjectSlug: string,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  const dtos = await getList<ChapterDto>(
    `/chapters/${qs({ subject: subjectSlug })}`,
    signal,
  )
  return toChapters(dtos).map((chapter) => ({ ...chapter, subjectId: subjectSlug }))
}

/** GET /api/v1/chapters/{slug}/ — one chapter. */
export async function fetchChapterById(
  chapterSlug: string,
  signal?: AbortSignal,
): Promise<Chapter | undefined> {
  try {
    const dto = await get<ChapterDto>(`/chapters/${chapterSlug}/`, signal)
    return toChapter(dto)
  } catch {
    return undefined
  }
}

/** Total published chapters across a class — powers "N chapters" headings. */
export async function fetchChapterCount(
  classId: ClassId | number,
  signal?: AbortSignal,
): Promise<number> {
  const chapters = await fetchChaptersForClass(classId, signal)
  return chapters.length
}
