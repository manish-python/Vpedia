import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { BookOpen } from 'lucide-react'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { ContentCard } from '@/components/cards/ContentCard'
import { ContentTabs } from '@/components/content/ContentTabs'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { SkeletonRows } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { useChapterContent } from '@/hooks/useCatalog'
import { CONTENT_TYPES, CONTENT_TYPE_ORDER } from '@/data/contentTypes'
import { resolveChapter } from '@/services/resolveService'
import { getAccent } from '@/utils/accent'
import { cn } from '@/utils/cn'
import type { ContentType } from '@/types'

/** Tab list is static, so it is built once rather than per render. */
const TABS = CONTENT_TYPE_ORDER.map((type) => ({ type, label: CONTENT_TYPES[type].label }))

/* ========================================================================
   Chapter content
   One page serves every content type through tabs. Adding a seventh type
   means extending CONTENT_TYPE_ORDER — not building a new page.

   The chapter slug in the URL is resolved to its subject and class through
   the API, not by parsing the slug. Lock state comes from the server's
   `has_access`, and the locked CTA is what a student without a purchase sees.
   =================================================================== */

export function ChapterContentPage() {
  const { chapterId } = useParams<{ chapterId: string }>()
  const [activeType, setActiveType] = useState<ContentType>('NOTES')

  // Breadcrumb first: without it there is nothing to render or link to.
  const resolved = useAsync((signal) => resolveChapter(chapterId ?? '', signal), [chapterId], {
    enabled: Boolean(chapterId),
  })

  const breadcrumb = resolved.data
  const content = useChapterContent(chapterId, breadcrumb ?? null, [activeType])

  useSeo({
    title: breadcrumb
      ? `${breadcrumb.chapter.name} — ${breadcrumb.subject.name}`
      : 'Chapter content',
    description: `Notes, PYQs, solved solutions and practice papers for ${breadcrumb?.chapter.name ?? 'this chapter'}.`,
    path: `/chapters/${chapterId}/content`,
    noIndex: true,
  })

  if (resolved.isLoading) {
    return (
      <div className="container-page py-16">
        <SkeletonRows count={5} />
      </div>
    )
  }

  if (resolved.error) {
    return (
      <div className="container-page py-16">
        <ErrorState message={resolved.error} onRetry={resolved.refetch} />
      </div>
    )
  }

  // Unknown chapter slug — the resolver walked the whole chain and found
  // nothing, so this is a genuinely dead link rather than a loading state.
  if (!breadcrumb) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Chapter not found"
          description="This chapter does not exist or is no longer available."
          action={{ label: 'Choose a class', to: '/classes' }}
        />
      </div>
    )
  }

  const items = content.data?.items ?? []
  // The server's verdict, not a local rule.
  const hasAccess = content.data?.hasAccess ?? false
  const { chapter, subject, vClass } = breadcrumb

  return (
    <div className="pb-16">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-6">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: `Class ${subject.classId}`, to: `/classes/${subject.classId}` },
              {
                label: subject.name,
                to: `/classes/${subject.classId}/subjects/${subject.id}/chapters`,
              },
              { label: chapter.name },
            ]}
          />
        </div>
      </div>

      <div className="container-page py-8 lg:py-10">
        <header className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className={cn(
              'flex size-14 items-center justify-center rounded-2xl',
              getAccent(subject.accent).tile,
            )}
          >
            <BookOpen className={cn('size-7', getAccent(subject.accent).text)} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl">{chapter.name}</h1>
            <p className="mt-1 text-ink-500">
              {subject.name} · Class {vClass.name.replace(/^Class\s+/, '')}
            </p>
          </div>
        </header>

        {!hasAccess ? (
          <div className="mt-8">
            <EmptyState
              title="Content Locked"
              description={`Purchase ${vClass.name} to access this study material.`}
              action={{ label: 'Purchase Class', to: `/classes/${vClass.id}` }}
              secondaryAction={{ label: 'Go to Dashboard', to: '/dashboard' }}
            />
          </div>
        ) : (
          <>
            <ContentTabs className="mt-7" active={activeType} onChange={setActiveType} tabs={TABS} />

            <div
              id={`panel-${activeType}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeType}`}
              tabIndex={-1}
              className="mt-6"
            >
              {content.isLoading ? (
                <SkeletonRows count={4} />
              ) : content.error ? (
                <ErrorState message={content.error} onRetry={content.refetch} />
              ) : items.length > 0 ? (
                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <ContentCard
                      key={item.id}
                      content={item}
                      classId={subject.classId}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No study material available yet."
                  description={`${CONTENT_TYPES[activeType].label} for this chapter are still being added.`}
                  action={{
                    label: 'Back to chapters',
                    to: `/classes/${subject.classId}/subjects/${subject.id}/chapters`,
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
