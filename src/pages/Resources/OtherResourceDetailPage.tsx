import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'

import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { Loader } from '@/components/common/Spinner'
import { useAsync, useSeo } from '@/hooks'
import {
  fetchOtherResource,
  otherResourceDocumentUrl,
  toResourceCard,
} from '@/services/resourceService'
import { formatDate } from '@/utils/format'

/* ========================================================================
   Other Resource detail
   ---------------------------------------------------------------------
   Reuses the existing `PDFViewer` rather than introducing a second one.

   The document source is the gated route
   `GET /other-resources/{slug}/document/`, which the backend re-checks for
   `is_published` and a signed-in user before returning a byte. No purchase is
   involved and none is checked here — Other Resources are deliberately outside
   the entitlement system.
   =================================================================== */

const PDFViewer = lazy(() =>
  import('@/components/pdf/PDFViewer').then((m) => ({ default: m.PDFViewer })),
)

export function OtherResourceDetailPage() {
  const { slug } = useParams<{ slug: string }>()

  const resource = useAsync(
    (signal) => fetchOtherResource(slug ?? '', signal),
    [slug],
    { enabled: Boolean(slug) },
  )

  const card = resource.data ? toResourceCard(resource.data) : null

  useSeo({
    title: card?.title ?? 'Resource',
    description: card?.description || 'Read this educational resource on VPEDIA LEARNING.',
    path: `/other-resources/${slug}`,
    noIndex: true,
  })

  if (resource.isLoading) {
    return (
      <div className="container-page py-10">
        <Loader label="Loading resource…" />
      </div>
    )
  }

  if (resource.error) {
    return (
      <div className="container-page py-16">
        <ErrorState
          title="Unable to load resource"
          message="Failed to load this resource. Please try again."
          onRetry={resource.refetch}
        />
      </div>
    )
  }

  if (!card) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Resource not found"
          description="This resource does not exist or is no longer available."
          action={{ label: 'Other Resources', to: '/other-resources' }}
        />
      </div>
    )
  }

  const documentSrc = otherResourceDocumentUrl(card.slug)

  return (
    <div className="pb-8">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-4">
          <Link
            to="/other-resources"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to Other Resources
          </Link>

          <header className="mt-4 flex items-start gap-3.5">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
            >
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight sm:text-3xl">{card.title}</h1>
              <p className="mt-1 text-sm text-ink-500">
                {card.categoryName}
                {card.fileName ? (
                  <>
                    <span aria-hidden className="mx-2">
                      ·
                    </span>
                    <span className="nums">{formatDate(resource.data?.created_at)}</span>
                  </>
                ) : null}
              </p>
            </div>
          </header>

          {card.description ? (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-600">
              {card.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="container-page py-6">
        {/* The existing viewer. Nothing about Other Resources needs a second one. */}
        <div className="h-[calc(100dvh-22rem)] min-h-125 overflow-hidden rounded-2xl border border-ink-200 shadow-card">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-ink-100">
                <Loader label="Loading document viewer…" />
              </div>
            }
          >
            <PDFViewer
              src={documentSrc}
              fileName={card.fileName ?? `${card.slug}.pdf`}
              title={card.title}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}