import { apiUrl, get, getList, qs } from './client'
import type { OtherResourceCategoryDto, OtherResourceDto } from '@/types/api'

/* ========================================================================
   Other Resources — student service
   ---------------------------------------------------------------------
   The SECOND content system, separate from class content:

     class content  →  Class → Stream → Subject → Chapter → Content
                       gated by has_class_access (an ACTIVE purchase)

     Other Resource →  Category → OtherResource
                       gated only by `is_published`

   Nothing here consults `has_class_access`, `PurchaseContext` or any purchase
   record. An Other Resource is not part of the syllabus and must never unlock
   a class; the API is the authority for that and there is no class field on
   the resource for it to be resolved through.

   Authentication: the backend requires a signed-in student for both the list
   and the document, matching the existing policy that educational material
   needs an account.
   ===================================================================== */

/** GET /api/v1/other-resource-categories/ — active categories only. */
export function fetchResourceCategories(signal?: AbortSignal): Promise<OtherResourceCategoryDto[]> {
  return getList<OtherResourceCategoryDto>('/other-resource-categories/', signal)
}

/**
 * GET /api/v1/other-resources/
 *
 * Only published rows are ever returned by the server, so a draft cannot
 * appear here even if the client asks for it.
 */
export function fetchOtherResources(
  options: { category?: string; search?: string; signal?: AbortSignal } = {},
): Promise<OtherResourceDto[]> {
  return getList<OtherResourceDto>(
    `/other-resources/${qs({ category: options.category, search: options.search })}`,
    options.signal,
  )
}

/** GET /api/v1/other-resources/{slug}/ — one published resource. */
export async function fetchOtherResource(
  slug: string,
  signal?: AbortSignal,
): Promise<OtherResourceDto | null> {
  if (!slug) return null
  try {
    return await get<OtherResourceDto>(`/other-resources/${slug}/`, signal)
  } catch {
    return null
  }
}

/**
 * Absolute URL of the gated document route.
 *
 * Returning a URL is not a grant. The server re-checks `is_published` and the
 * signed-in requirement before returning a byte, so a student who somehow
 * learned this URL while the row was a draft still gets a 404.
 */
export function otherResourceDocumentUrl(slug: string): string {
  return apiUrl(`/other-resources/${slug}/document/`)
}

/* ---------------------------------------------------------------------
   Shared view-model
   ------------------------------------------------------------------ */

export interface ResourceCard {
  id: number
  slug: string
  title: string
  description: string
  categoryName: string
  categorySlug: string
  fileName: string | null
}

export function toResourceCard(dto: OtherResourceDto): ResourceCard {
  return {
    id: dto.id,
    slug: dto.slug,
    title: dto.title,
    description: dto.description,
    categoryName: dto.category_name,
    categorySlug: dto.category_slug,
    fileName: dto.file_name,
  }
}