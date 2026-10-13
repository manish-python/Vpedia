import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchClasses, fetchStreams } from '@/services/classService'
import { fetchContentById, fetchChapterContent, type ChapterContentResult } from '@/services/contentService'
import { fetchMyPaymentProofs, fetchUPISettings } from '@/services/paymentService'
import { fetchUnlockedClasses } from '@/services/purchaseService'
import {
  fetchChapters,
  fetchChaptersForClass,
  fetchSubjectById,
  fetchSubjects,
} from '@/services/subjectService'
import { useAsync, type AsyncState } from './useAsync'
import type {
  Chapter,
  ClassId,
  ContentType,
  PaymentProof,
  StreamId,
  Subject,
  UPIConfig,
  VClass,
} from '@/types'
import type { UnlockedClassDto } from '@/types/api'

/* ========================================================================
   Data hooks

   Every API-driven surface goes through one of these, so pages hold no
   request logic. They wrap the existing `useAsync`, which already handles
   request cancellation, stale responses and unmount safety.

   The flow is:  component → hook → service → Django → PostgreSQL.
   No component reaches a service directly for list data, and none of them
   touch a fixture.
   =================================================================== */

/* ---------------------------------------------------------------------
   Catalogue
   ------------------------------------------------------------------ */

/** GET /api/v1/classes/ — the six classes, with server-side prices. */
export function useClasses(): AsyncState<VClass[]> & { refetch: () => void } {
  return useAsync<VClass[]>((signal) => fetchClasses(signal), [])
}

/** One class by number. Undefined while loading or when it does not exist. */
export function useClass(
  classNumber: number | undefined,
): AsyncState<VClass | undefined> & { refetch: () => void } {
  const task = useCallback(
    async (signal: AbortSignal) => {
      if (!classNumber) return undefined
      const { fetchClassById } = await import('@/services/classService')
      return fetchClassById(classNumber as ClassId, signal)
    },
    [classNumber],
  )
  return useAsync<VClass | undefined>(task, [classNumber], { enabled: Boolean(classNumber) })
}

/**
 * Streams for a class.
 *
 * Empty for classes 7-10, which is the signal the UI uses to hide stream
 * selection entirely rather than branching on a hard-coded class number.
 */
export function useStreams(
  classNumber: number | undefined,
): AsyncState<Awaited<ReturnType<typeof fetchStreams>>> & { refetch: () => void } {
  const task = useCallback(
    (signal: AbortSignal) => fetchStreams(classNumber ?? null, signal),
    [classNumber],
  )
  return useAsync(task, [classNumber], { enabled: classNumber !== undefined })
}

/** Subjects in a class, optionally narrowed to a stream. */
export function useSubjects(
  classNumber: number | undefined,
  streamId?: StreamId | null,
): AsyncState<Subject[]> & { refetch: () => void } {
  // No `?? 7`. The task only runs when `classNumber` is set, and when it is
  // set it is the class the caller asked for. Substituting 7 for anything else
  // would quietly show the wrong class's subjects.
  const task = useCallback(
    (signal: AbortSignal) =>
      fetchSubjects(classNumber as ClassId, streamId ?? null, signal),
    [classNumber, streamId],
  )
  return useAsync<Subject[]>(task, [classNumber, streamId], {
    enabled: classNumber !== undefined && classNumber !== null,
  })
}

/** One subject by slug. */
export function useSubject(
  subjectSlug: string | undefined,
): AsyncState<Subject | undefined> & { refetch: () => void } {
  const task = useCallback(
    async (signal: AbortSignal) => (subjectSlug ? fetchSubjectById(subjectSlug, signal) : undefined),
    [subjectSlug],
  )
  return useAsync<Subject | undefined>(task, [subjectSlug], {
    enabled: Boolean(subjectSlug),
  })
}

/** Chapters in a subject, with published-material counts. */
export function useChapters(
  subjectSlug: string | undefined,
): AsyncState<Chapter[]> & { refetch: () => void } {
  const task = useCallback(
    async (signal: AbortSignal) => (subjectSlug ? fetchChapters(subjectSlug, signal) : []),
    [subjectSlug],
  )
  return useAsync<Chapter[]>(task, [subjectSlug], { enabled: Boolean(subjectSlug) })
}

/** Every chapter in a class — used by search and the library. */
export function useClassChapters(
  classNumber: number | undefined,
): AsyncState<Chapter[]> & { refetch: () => void } {
  const task = useCallback(
    async (signal: AbortSignal) =>
      classNumber ? fetchChaptersForClass(classNumber as ClassId, signal) : [],
    [classNumber],
  )
  return useAsync<Chapter[]>(task, [classNumber], { enabled: classNumber !== undefined })
}

/* ---------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */

export interface ChapterBreadcrumb {
  chapter: Chapter
  subject: Subject
  vClass: VClass
}

/**
 * Material for a chapter, with the server's access verdict.
 *
 * `hasAccess` comes from the API response and is what the locked CTA keys
 * off. It is not derived from the selected class or from any local list.
 */
export function useChapterContent(
  chapterSlug: string | undefined,
  breadcrumb: ChapterBreadcrumb | null,
  types?: ContentType[],
): AsyncState<ChapterContentResult | null> & { refetch: () => void } {
  const task = useCallback(
    async (signal: AbortSignal) => {
      if (!chapterSlug || !breadcrumb) return null
      return fetchChapterContent(chapterSlug, breadcrumb, { types, signal })
    },
    // `breadcrumb` is rebuilt on every render by the caller, so depend on the
    // identifiers instead of the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapterSlug, breadcrumb?.chapter.id, breadcrumb?.subject.id, breadcrumb?.vClass.id, types],
  )
  /**
   * The selected types are a dependency of the *request*, not just of `task`.
   *
   * `useAsync` keys its effect on `[enabled, nonce, ...deps]`. A value that only
   * appears inside the `task` closure therefore never triggers a refetch - the
   * effect body simply does not run again. That is exactly why clicking a tab
   * used to highlight it without ever re-querying: the new type reached
   * `taskRef.current` but not the dependency list, so the previously fetched
   * results stayed on screen.
   *
   * Joined to a string, so the fresh array literal the caller passes cannot
   * retrigger the effect on every render either.
   */
  const typeKey = (types ?? []).join(',')
  return useAsync<ChapterContentResult | null>(
    task,
    [chapterSlug, breadcrumb?.chapter.id, typeKey],
    { enabled: Boolean(chapterSlug && breadcrumb) },
  )
}

/** One content row, with its breadcrumb. */
export function useContent(
  contentSlug: string | undefined,
  breadcrumb: ChapterBreadcrumb | null,
) {
  const task = useCallback(
    async (signal: AbortSignal) =>
      contentSlug && breadcrumb ? fetchContentById(contentSlug, breadcrumb, signal) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentSlug, breadcrumb?.chapter.id, breadcrumb?.subject.id, breadcrumb?.vClass.id],
  )
  return useAsync(task, [contentSlug, breadcrumb?.chapter.id], {
    enabled: Boolean(contentSlug && breadcrumb),
  })
}

/* ---------------------------------------------------------------------
   Purchases & payments
   ------------------------------------------------------------------ */

/**
 * GET /api/v1/my-classes/ — classes with an ACTIVE purchase.
 *
 * The authoritative unlocked list. `PurchaseContext` derives its own
 * unlocked set from the purchase records; both come from the server, and
 * neither can be widened by the client.
 */
export function useUnlockedClasses(
  enabled: boolean,
): AsyncState<UnlockedClassDto[]> & { refetch: () => void } {
  return useAsync<UnlockedClassDto[]>((signal) => fetchUnlockedClasses(signal), [], { enabled })
}

/** GET /api/v1/payments/my/ — the caller's own proof history. */
export function usePaymentProofs(
  enabled: boolean,
): AsyncState<PaymentProof[]> & { refetch: () => void } {
  return useAsync<PaymentProof[]>((signal) => fetchMyPaymentProofs(signal), [], { enabled })
}

/**
 * GET /api/v1/payments/upi/ — live UPI configuration.
 *
 * Fetched at payment time rather than cached, so an administrator's change
 * in Django Admin reaches the next student immediately.
 */
export function useUPISettings(enabled = true): AsyncState<UPIConfig | null> & {
  refetch: () => void
} {
  return useAsync<UPIConfig | null>((signal) => fetchUPISettings(signal), [], { enabled })
}

/* ---------------------------------------------------------------------
   Session-wide catalogue cache
   ---------------------------------------------------------------------
   Class names, prices and stream lists change rarely and are needed on
   nearly every page. One shared fetch, refetched on demand, instead of the
   same request per page.

   Deliberately not a general cache: no invalidation graph, no persistence,
   no stale-while-revalidate. `refreshCatalogue()` exists for after an admin
   edit, which is rare enough to be a manual action.
   ------------------------------------------------------------------ */

interface CatalogueState {
  classes: VClass[]
  isLoading: boolean
  error: string | null
}

let catalogue: CatalogueState = { classes: [], isLoading: false, error: null }
let inflight: Promise<VClass[]> | null = null
const subscribers = new Set<(state: CatalogueState) => void>()

function publish(next: CatalogueState) {
  catalogue = next
  subscribers.forEach((notify) => notify(catalogue))
}

async function loadCatalogue(): Promise<VClass[]> {
  // De-duplicate concurrent callers so mounting three pages at once issues
  // one request, not three.
  if (inflight) return inflight

  publish({ ...catalogue, isLoading: true, error: null })
  inflight = fetchClasses()
    .then((classes) => {
      publish({ classes, isLoading: false, error: null })
      return classes
    })
    .catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : 'Unable to load classes.'
      publish({ classes: [], isLoading: false, error: message })
      throw cause
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function useCatalogue(): CatalogueState & { refresh: () => Promise<void> } {
  const [state, setState] = useState(catalogue)

  useEffect(() => {
    subscribers.add(setState)
    return () => {
      subscribers.delete(setState)
    }
  }, [])

  useEffect(() => {
    if (!catalogue.classes.length && !catalogue.isLoading) {
      void loadCatalogue().catch(() => undefined)
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadCatalogue().catch(() => undefined)
  }, [])

  return useMemo(() => ({ ...state, refresh }), [state, refresh])
}

/** Look up a loaded class by number, for code that already has the catalogue. */
export function useClassLookup(): (classNumber: number | undefined) => VClass | undefined {
  const { classes } = useCatalogue()
  return useCallback(
    (classNumber: number | undefined) =>
      classNumber === undefined ? undefined : classes.find((c) => c.id === classNumber),
    [classes],
  )
}
