import { lazy, Suspense, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { ButtonLink } from '@/components/common/Button'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { Loader } from '@/components/common/Spinner'
import { SkeletonViewer } from '@/components/common/Skeleton'
import { LockedIllustration } from '@/components/illustrations/Illustrations'
import { useAsync, useSeo } from '@/hooks'
import { fetchContentById, fetchDocumentRef, type DocumentRef } from '@/services/contentService'
import { resolveContent } from '@/services/resolveService'
import { getContentTypeMeta } from '@/data/contentTypes'
import type { ResolvedContent } from '@/types'

/* ========================================================================
   Notes viewer
   ---------------------------------------------------------------------
   PDF.js is the heaviest dependency in the product, so the viewer is
   loaded only when this route is visited.

   The document source always comes from the content service, and it is the
   *gated* document route: `GET /contents/{slug}/document/`, which the backend
   re-checks against `has_class_access` before returning a byte. A locked
   student gets a 403 there, not a file.

   Lock state shown here is the server's `is_locked`. There is no local rule.
   =================================================================== */

const PDFViewer = lazy(() =>
  import('@/components/pdf/PDFViewer').then((m) => ({ default: m.PDFViewer })),
)

export function NotesViewerPage() {
  const { contentId } = useParams<{ contentId: string }>()

  // The URL carries one slug; the breadcrumb is resolved from the API.
  const resolved = useAsync((signal) => resolveContent(contentId ?? '', signal), [contentId], {
    enabled: Boolean(contentId),
  })

  const breadcrumb = resolved.data

  const content = useAsync<ResolvedContent | null>(
    async (signal) => (contentId && breadcrumb ? fetchContentById(contentId, breadcrumb, signal) : null),
    [contentId, breadcrumb?.chapter.id],
    { enabled: Boolean(contentId && breadcrumb) },
  )

  const isLocked = content.data?.isLocked ?? false

  const { data: documentRef, isLoading: docLoading, error: docError } = useAsync<DocumentRef | null>(
    (signal) => fetchDocumentRef(contentId!, signal),
    [contentId],
    { enabled: Boolean(content.data) && !isLocked },
  )

  useSeo({
    title: content.data ? content.data.title : 'Document viewer',
    description: 'Read your study material.',
    path: `/notes/${contentId}`,
    noIndex: true,
  })

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [contentId])

  if (resolved.isLoading || content.isLoading) {
    return (
      <div className="container-page py-10">
        <Loader label="Preparing your document…" />
      </div>
    )
  }

  if (resolved.error || content.error) {
    return (
      <div className="container-page py-16">
        <ErrorState message={resolved.error ?? content.error ?? ''} onRetry={content.refetch} />
      </div>
    )
  }

  if (!content.data) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Document not found"
          description="This material is not available."
          action={{ label: 'Go to Dashboard', to: '/dashboard' }}
        />
      </div>
    )
  }

  const item = content.data
  const typeMeta = getContentTypeMeta(item.type)

  /* -------------------------------------------------------------------
     Locked — nothing about the document is fetched or rendered.
     ------------------------------------------------------------------- */
  if (isLocked) {
    return (
      <div className="container-page py-10">
        <BackLink />
        <div className="mx-auto mt-8 max-w-lg">
          <EmptyState
            illustration={<LockedIllustration size={190} />}
            title="Content Locked"
            description="Purchase this class to access this study material."
            action={{ label: 'Purchase Class', to: `/classes/${item.vClass.id}` }}
            secondaryAction={{ label: 'Go to Dashboard', to: '/dashboard' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="pb-8">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-4">
          <BackLink />
          <Breadcrumb
            className="mt-3"
            items={[
              { label: 'Home', to: '/' },
              { label: `Class ${item.vClass.id}`, to: `/classes/${item.vClass.id}` },
              {
                label: item.subject.name,
                to: `/classes/${item.vClass.id}/subjects/${item.subject.id}/chapters`,
              },
              {
                label: item.chapter.name,
                to: `/chapters/${item.chapter.id}/content`,
              },
              { label: item.title },
            ]}
          />
        </div>
      </div>

      <div className="container-page py-6">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl">{item.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${typeMeta.tile}`}
              >
                {typeMeta.label}
              </span>
              <span>
                {item.subject.name} · {item.chapter.name}
              </span>
              {typeof item.pageCount === 'number' && item.pageCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="nums">{item.pageCount} pages</span>
                </>
              ) : null}
            </p>
          </div>

          <ButtonLink to={`/pyqs/${item.subject.id}`} variant="outline" size="sm">
            View PYQs
          </ButtonLink>
        </header>

        {/* Viewer */}
        <div className="h-[calc(100dvh-19rem)] min-h-125 overflow-hidden rounded-2xl border border-ink-200 shadow-card">
          {docLoading ? (
            <div className="bg-ink-100 p-6">
              <SkeletonViewer />
            </div>
          ) : docError || !documentRef ? (
            <div className="p-6">
              <ErrorState
                title="Unable to load content."
                message={
                  docError ??
                  'The document could not be opened. It may have expired — reopen it to get a fresh link.'
                }
                onRetry={() => window.location.reload()}
              />
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-ink-100">
                  <Loader label="Loading document viewer…" />
                </div>
              }
            >
              <PDFViewer
                src={documentRef.src}
                fileName={documentRef.fileName}
                title={item.title}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm font-semibold text-ink-600 transition-colors hover:text-brand-700"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back
    </button>
  )
}
