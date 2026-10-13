import type { Chapter, ClassId, Subject, VClass } from '@/types'
import type { ChapterDto, ClassLevelDto, ContentDto, SubjectDto } from '@/types/api'
import { get } from './client'
import { classSlug } from './classService'
import { toChapter, toSubject, toVClass, toClassId } from './mappers'

/* ========================================================================
   Route resolver

   A URL carries one slug — `/chapters/class-10-mathematics-real-numbers/content`.
   A page needs four things to render: the chapter, its subject, the owning
   class, and whether the student may read it.

   Rather than slicing the slug apart — which breaks the moment a subject name
   contains a hyphen — this walks the real relationships, one cheap request
   per hop:

     chapter  →  subject_slug  →  subject  →  class_level id  →  class

   The class hop reuses the session-wide catalogue, so it is usually free.
   =================================================================== */

/** The four objects a content page needs. */
export interface Breadcrumb {
  chapter: Chapter
  subject: Subject
  vClass: VClass
}

/** Raw class rows, for resolving a numeric class id to its view model. */
let classCache: ClassLevelDto[] = []

export function primeClassCache(dtos: ClassLevelDto[]): void {
  classCache = dtos
}

/** GET /api/v1/classes/ once, shared by every resolver. */
export async function ensureClassCache(signal?: AbortSignal): Promise<ClassLevelDto[]> {
  if (classCache.length) return classCache
  classCache = await fetchAllClasses(signal)
  return classCache
}

async function fetchAllClasses(signal?: AbortSignal): Promise<ClassLevelDto[]> {
  const { getList } = await import('./client')
  return getList<ClassLevelDto>('/classes/', signal)
}

function classById(id: number): VClass | undefined {
  const index = classCache.findIndex((dto) => dto.id === id)
  if (index === -1) return undefined
  const dto = classCache[index]
  if (!dto) return undefined
  if (toClassId(dto.number) === null) return undefined
  return toVClass(dto, index)
}

/** Resolve a content slug to its chapter, subject and class. */
export async function resolveContent(
  contentSlug: string,
  signal?: AbortSignal,
): Promise<Breadcrumb | null> {
  if (!contentSlug) return null

  const dto = await get<ContentDto>(`/contents/${contentSlug}/`, signal)

  await ensureClassCache(signal)
  const vClass = classById(dto.class_level_id)
  if (!vClass) return null

  // The content row names its subject but not its slug; the chapter carries
  // both, so one cheap lookup fills the gap.
  const chapterDto = await get<ChapterDto>(`/chapters/${dto.chapter_slug}/`, signal)
  const subjectDto = await get<SubjectDto>(`/subjects/${dto.subject_slug || chapterDto.subject_slug}/`, signal)

  const subject = toSubject(subjectDto, 0, vClass.id)
  const chapter: Chapter = {
    ...(toChapter(chapterDto) ?? {
      id: dto.chapter_slug,
      subjectId: subject.id,
      number: dto.chapter_number,
      name: dto.chapter_name,
      blurb: '',
    }),
    subjectId: subject.id,
  }

  return { chapter, subject, vClass }
}

/** Resolve a chapter slug to its chapter, subject and class. */
export async function resolveChapter(
  chapterSlug: string,
  signal?: AbortSignal,
): Promise<Breadcrumb | null> {
  if (!chapterSlug) return null

  const chapterDto = await get<ChapterDto>(`/chapters/${chapterSlug}/`, signal)

  await ensureClassCache(signal)
  const vClass = classById(chapterDto.class_level)
  if (!vClass) return null

  const subjectDto = await get<SubjectDto>(`/subjects/${chapterDto.subject_slug}/`, signal)
  const subject = toSubject(subjectDto, 0, vClass.id)
  const chapter: Chapter = {
    ...(toChapter(chapterDto) ?? {
      id: chapterDto.slug,
      subjectId: subject.id,
      number: chapterDto.number,
      name: chapterDto.name,
      blurb: '',
    }),
    subjectId: subject.id,
  }

  return { chapter, subject, vClass }
}

/** Resolve a subject slug to its subject and class. */
export async function resolveSubject(
  subjectSlug: string,
  signal?: AbortSignal,
): Promise<{ subject: Subject; vClass: VClass } | null> {
  if (!subjectSlug) return null

  const subjectDto = await get<SubjectDto>(`/subjects/${subjectSlug}/`, signal)

  await ensureClassCache(signal)
  const vClass = classById(subjectDto.class_level)
  if (!vClass) return null

  return { subject: toSubject(subjectDto, 0, vClass.id), vClass }
}

/** Resolve a class number straight to its view model, from the cache. */
export async function resolveClass(
  classNumber: ClassId | number,
  signal?: AbortSignal,
): Promise<VClass | null> {
  await ensureClassCache(signal)
  const index = classCache.findIndex((dto) => toClassId(dto.number) === Number(classNumber))
  if (index === -1) return null
  const dto = classCache[index]
  return dto ? toVClass(dto, index) : null
}

/** Path to the chapters list for a subject, used for breadcrumbs and CTAs. */
export function chaptersPath(subject: Subject): string {
  return `/classes/${subject.classId}/subjects/${subject.id}/chapters`
}

/** Path to a class's subject list. */
export function subjectsPath(classId: number, streamId?: string | null): string {
  const suffix = streamId ? `?stream=${encodeURIComponent(streamId)}` : ''
  return `/classes/${classId}/subjects${suffix}`
}

/** Path to a chapter's content. */
export function chapterContentPath(chapter: Chapter): string {
  return `/chapters/${chapter.id}/content`
}

/** Path to a class page. */
export function classPath(classNumber: number): string {
  return `/classes/${classNumber}`
}

/**
 * Path to a class detail page for a class the catalogue returned.
 *
 * `number` is the class the catalogue actually served. When it is missing the
 * slug itself is a safe fallback — it is the identifier that came from the
 * server — whereas the old `?? 7` invented a class the student never chose.
 */
export function classPathFromDto(dto: ClassLevelDto): string {
  const number = toClassId(dto.number)
  return number ? classSlug(number) : `/classes/${dto.slug}`
}
