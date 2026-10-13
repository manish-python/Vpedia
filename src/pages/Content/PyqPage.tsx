import { useParams } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { ContentCard } from '@/components/cards/ContentCard'
import { ButtonLink } from '@/components/common/Button'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { SkeletonRows } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { fetchSubjectPyqs } from '@/services/contentService'
import { fetchChapters } from '@/services/subjectService'
import { resolveSubject } from '@/services/resolveService'
import { getSubjectIcon } from '@/utils/icons'
import { getAccent } from '@/utils/accent'
import { cn } from '@/utils/cn'
import type { AccentKey, ResolvedContent, SubjectIconKey } from '@/types'

/* ========================================================================
   Previous Year Questions
   Reuses ContentCard, so PYQs render identically everywhere they appear.
   =================================================================== */

export function PyqPage() {
  const { subjectId } = useParams<{ subjectId: string }>()

  // The URL carries the subject slug; class and breadcrumb come from the API.
  const resolved = useAsync((signal) => resolveSubject(subjectId ?? '', signal), [subjectId], {
    enabled: Boolean(subjectId),
  })

  const subject = resolved.data?.subject
  const vClass = resolved.data?.vClass

  const pyqs = useAsync<ResolvedContent[]>(
    async (signal) => {
      if (!subjectId || !subject || !vClass) return []
      const chapters = await fetchChapters(subjectId, signal)
      return fetchSubjectPyqs(subject, vClass, chapters, { signal })
    },
    [subjectId, subject?.id, vClass?.id],
    { enabled: Boolean(subjectId && subject && vClass) },
  )

  const subjectName = subject?.name ?? 'Subject'
  const classId = vClass?.id ?? 10

  useSeo({
    title: `${subjectName} Previous Year Questions`,
    description: `Previous year question papers for ${subjectName}, ${vClass?.name ?? ''}, on VPEDIA LEARNING.`,
    path: `/pyqs/${subjectId}`,
    noIndex: true,
  })

  if (resolved.isLoading || pyqs.isLoading) {
    return (
      <div className="container-page py-16">
        <SkeletonRows count={5} />
      </div>
    )
  }

  if (resolved.error || pyqs.error) {
    return (
      <div className="container-page py-16">
        <ErrorState message={resolved.error ?? pyqs.error ?? ''} onRetry={resolved.refetch} />
      </div>
    )
  }

  if (!subject || !vClass) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Subject not found"
          description="This subject does not exist or is no longer available."
          action={{ label: 'Choose a class', to: '/classes' }}
        />
      </div>
    )
  }

  const data = pyqs.data ?? []
  // Access is read from the rows the server returned, each of which carries
  // its own `is_locked`.
  const locked = data.length > 0 && data.every((row) => row.isLocked)

  if (locked) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Access Restricted"
          description="You need to purchase this class to access this content."
          action={{ label: 'Purchase Class', to: `/classes/${classId}` }}
          secondaryAction={{ label: 'Go to Dashboard', to: '/dashboard' }}
        />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-6">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: `Class ${classId}`, to: `/classes/${classId}` },
              { label: subjectName, to: `/classes/${classId}/subjects/${subject.id}/chapters` },
              { label: 'PYQs' },
            ]}
          />
        </div>
      </div>

      <div className="container-page py-8 lg:py-10">
        <header className="flex flex-wrap items-center gap-4">
          <SubjectIconTile iconKey={subject.icon} accentKey={subject.accent} />
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl">Previous Year Questions</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-ink-500">
              <span>{subjectName}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden />
                Last five years
              </span>
            </p>
          </div>
        </header>

        <div className="mt-8">
          {pyqs.isLoading ? (
            <SkeletonRows count={5} />
          ) : pyqs.error ? (
            <ErrorState message={pyqs.error} onRetry={pyqs.refetch} />
          ) : data.length > 0 ? (
            <ul className="space-y-2.5">
              {data.map((pyq) => (
                <ContentCard key={pyq.id} content={pyq} classId={classId} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No study material available yet."
              description="Previous year questions for this subject are still being added."
              action={{ label: 'Back to chapters', to: `/classes/${classId}/subjects` }}
            />
          )}
        </div>

        <div className="mt-10">
          <ButtonLink
            to={`/classes/${classId}/subjects/${subject.id}/chapters`}
            variant="outline"
            size="md"
          >
            Back to chapters
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}

/** Module-scope tile so the icon element is never recreated during render. */
function SubjectIconTile({
  iconKey,
  accentKey,
}: {
  iconKey: SubjectIconKey | undefined
  accentKey: AccentKey | undefined
}) {
  const Icon = getSubjectIcon(iconKey)
  const palette = getAccent(accentKey)

  return (
    <span
      aria-hidden
      className={cn('flex size-14 items-center justify-center rounded-2xl', palette.tile)}
    >
      <Icon className={cn('size-7', palette.text)} strokeWidth={2} />
    </span>
  )
}
