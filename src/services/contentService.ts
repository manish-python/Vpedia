import type { Chapter, ContentItem, ContentType, ResolvedContent, Subject, VClass } from '@/types'
import type {
  ChapterContentsDto,
  ContentAccessDto,
  ContentDto,
} from '@/types/api'
import { apiUrl, get, getList, qs } from './client'
import { classSlug } from './classService'
import { toContentItem } from './mappers'

/* ========================================================================
   Content service

   Access control
   --------------
   `is_locked` on every row is computed by the server from `has_class_access`.
   This service reads it and nothing more. There is no local unlock rule, no
   purchased-classes argument, and no recomputation from a frontend list —
   a client-side check would only ever be a hint, and a hint is not a gate.

   The gate that matters is `GET /contents/{slug}/document/`, which the server
   re-checks before returning a single byte of material.

   Sources
   -------
     GET /api/v1/chapters/{slug}/contents/   → { has_access, results[] }
     GET /api/v1/contents/{slug}/            → one row
     GET /api/v1/contents/{slug}/access/     → { allowed, reason }
     GET /api/v1/contents/{slug}/document/   → the bytes, gated server-side
     GET /api/v1/contents/?chapter=&class=&type=
   =================================================================== */

/** Metadata plus the server's verdict for one chapter. */
export interface ChapterContentResult {
  items: ResolvedContent[]
  /** The chapter's own type list, so the UI can show the right tabs. */
  types: ContentType[]
  /** Server-computed: does this student own the class owning the chapter? */
  hasAccess: boolean
}

function resolveAll(
  results: ContentDto[],
  chapter: Chapter,
  subject: Subject,
  vClass: VClass,
): ResolvedContent[] {
  return results.map((dto) => {
    const item = toContentItem(dto, chapter.id)
    return { ...item, chapter, subject, vClass }
  })
}

/**
 * GET /api/v1/chapters/{slug}/contents/
 *
 * The breadcrumb objects are supplied by the caller because the page already
 * holds them; only the material comes over the wire.
 */
export async function fetchChapterContent(
  chapterSlug: string,
  breadcrumb: { chapter: Chapter; subject: Subject; vClass: VClass },
  options: { types?: ContentType[]; signal?: AbortSignal } = {},
): Promise<ChapterContentResult> {
  const payload = await get<ChapterContentsDto>(
    `/chapters/${chapterSlug}/contents/${qs({ type: options.types?.join(',') })}`,
    options.signal,
  )

  const results = Array.isArray(payload?.results) ? payload.results : []

  return {
    items: resolveAll(results, breadcrumb.chapter, breadcrumb.subject, breadcrumb.vClass),
    types: deriveTypes(results, options.types),
    hasAccess: payload?.has_access ?? false,
  }
}

/**
 * The type tabs to render.
 *
 * Prefers the requested filter so the UI keeps showing what the student
 * picked, then falls back to what the server actually has. Never invents a
 * type with no rows behind it.
 */
function deriveTypes(results: ContentDto[], requested?: ContentType[]): ContentType[] {
  if (requested?.length) return requested
  return [...new Set(results.map((row) => row.content_type))] as ContentType[]
}

/** GET /api/v1/contents/?chapter=&class=&type= — metadata for a listing. */
export async function fetchContentForChapter(
  chapterSlug: string,
  breadcrumb: { chapter: Chapter; subject: Subject; vClass: VClass },
  options: { types?: ContentType[]; signal?: AbortSignal } = {},
): Promise<ChapterContentResult> {
  const rows = await getList<ContentDto>(
    `/contents/${qs({
      chapter: chapterSlug,
      class: classSlug(breadcrumb.vClass.id),
      type: options.types?.join(','),
    })}`,
    options.signal,
  )
  return {
    items: resolveAll(rows, breadcrumb.chapter, breadcrumb.subject, breadcrumb.vClass),
    types: deriveTypes(rows, options.types),
    hasAccess: rows.length > 0 ? !rows.every((row) => row.is_locked) : false,
  }
}

/** Every PYQ for a subject, across its chapters. */
export async function fetchSubjectPyqs(
  subject: Subject,
  vClass: VClass,
  chapters: Chapter[],
  options: { signal?: AbortSignal } = {},
): Promise<ResolvedContent[]> {
  const rows = await getList<ContentDto>(
    `/contents/${qs({ class: classSlug(vClass.id), type: 'PYQ' })}`,
    options.signal,
  )

  const bySlug = new Map(chapters.map((chapter) => [chapter.id, chapter]))

  return rows
    .filter((row) => row.subject_name === subject.name)
    .map((row) => {
      const chapter = bySlug.get(row.slug.split('-').slice(0, -1).join('-')) ?? {
        id: row.slug,
        subjectId: subject.id,
        number: row.chapter_number,
        name: row.chapter_name,
        blurb: '',
      }
      return { ...toContentItem(row, chapter.id), chapter, subject, vClass }
    })
}

/** GET /api/v1/contents/{slug}/access/ — the server's verdict, for a badge. */
export async function fetchContentAccess(
  contentSlug: string,
  signal?: AbortSignal,
): Promise<ContentAccessDto | null> {
  try {
    return await get<ContentAccessDto>(`/contents/${contentSlug}/access/`, signal)
  } catch {
    return null
  }
}

/** GET /api/v1/contents/{slug}/ — one row's metadata. */
export async function fetchContentById(
  contentSlug: string,
  breadcrumb: { chapter: Chapter; subject: Subject; vClass: VClass },
  signal?: AbortSignal,
): Promise<ResolvedContent | null> {
  try {
    const dto = await get<ContentDto>(`/contents/${contentSlug}/`, signal)
    return { ...toContentItem(dto, breadcrumb.chapter.id), ...breadcrumb }
  } catch {
    return null
  }
}

/** Single content lookup with no breadcrumb, for search results. */
export async function fetchContentMeta(
  contentSlug: string,
  signal?: AbortSignal,
): Promise<ContentItem | null> {
  try {
    const dto = await get<ContentDto>(`/contents/${contentSlug}/`, signal)
    return toContentItem(dto, String(dto.chapter))
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------------
   Document access

   The viewer never holds a permanent file URL. It asks for the document
   each time it opens, and the server re-checks the purchase before sending
   a byte. A 403 here is a real refusal, not a UI hint.
   ------------------------------------------------------------------ */

export interface DocumentRef {
  /** Resolvable source for PDF.js — the gated document endpoint. */
  src: string
  title: string
  fileName: string
  expiresInSeconds: number | null
}

/** Absolute URL for the gated document route. */
export function documentUrl(contentSlug: string): string {
  return apiUrl(`/contents/${contentSlug}/document/`)
}

/**
 * Confirms access before the viewer tries to load bytes.
 *
 * Returning a URL here is not a grant — the browser will still get a 403 if
 * the purchase is not ACTIVE, and the viewer surfaces that.
 */
export async function fetchDocumentRef(
  contentSlug: string,
  signal?: AbortSignal,
): Promise<DocumentRef | null> {
  const access = await fetchContentAccess(contentSlug, signal)
  if (!access?.allowed) return null

  return {
    src: documentUrl(contentSlug),
    title: contentSlug,
    fileName: `${contentSlug}.pdf`,
    expiresInSeconds: null,
  }
}

/** Total published material rows for a class — powers library counts. */
export async function fetchMaterialCount(
  classId: number,
  signal?: AbortSignal,
): Promise<number> {
  const rows = await getList<ContentDto>(`/contents/${qs({ class: classSlug(classId) })}`, signal)
  return rows.length
}
