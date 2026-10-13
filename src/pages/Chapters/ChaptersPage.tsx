import { Navigate, useParams } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { ButtonLink } from '@/components/common/Button'
import { UnlockedBadge } from '@/components/common/Badge'
import { ChapterCard } from '@/components/cards/ChapterCard'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { SkeletonRows } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchSubjectById } from '@/services/subjectService'
import { fetchChapters } from '@/services/subjectService'
import { getSubjectIcon } from '@/utils/icons'
import { getAccent } from '@/utils/accent'
import { pluralise } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { AccentKey, Chapter, ClassId, Subject, SubjectIconKey } from '@/types'

/* ========================================================================
   Chapters for a subject
   =================================================================== */

export function ChaptersPage() {
  const { classId: classIdParam, subjectId } = useParams<{ classId: string; subjectId: string }>()
  const classId = Number(classIdParam)
  const { isUnlocked } = usePurchase()

  const { data: subject, isLoading: subjectLoading } = useAsync<Subject | undefined>(
    (signal) => fetchSubjectById(subjectId!, signal),
    [subjectId],
  )

  const { data: chapters, isLoading, error, refetch } = useAsync<Chapter[]>(
    (signal) => fetchChapters(subjectId!, signal),
    [subjectId],
  )

  const unlocked = isUnlocked(classId as ClassId)

  useSeo({
    title: subject ? `${subject.name} Chapters` : 'Chapters',
    description: `Chapter list for ${subject?.name ?? 'your subject'}.`,
    path: `/classes/${classId}/subjects/${subjectId}/chapters`,
    noIndex: true,
  })

  // A subject that belongs to a different class is a routing mistake.
  if (subject && subject.classId !== classId) {
    return <Navigate to={`/classes/${subject.classId}/subjects/${subject.id}/chapters`} replace />
  }

  if (!unlocked) {
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

  const subjectName = subject?.name ?? 'Subject'

  return (
    <div className="pb-16">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-6">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: `Class ${classId}`, to: `/classes/${classId}` },
              { label: subjectName, to: `/classes/${classId}/subjects/${subjectId}` },
              { label: 'Chapters' },
            ]}
          />
        </div>
      </div>

      <div className="container-page py-8 lg:py-10">
        <header className="flex flex-wrap items-center gap-4">
          {subjectLoading ? (
            <div className="skeleton-base size-14 rounded-2xl" />
          ) : (
            <SubjectIconTile iconKey={subject?.icon} accentKey={subject?.accent} />
          )}

          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl">{subjectName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-500">
              <span>{pluralise(chapters?.length ?? subject?.chapterCount ?? 0, 'chapter')}</span>
              <UnlockedBadge />
            </p>
          </div>
        </header>

        <div className="mt-8">
          {isLoading ? (
            <SkeletonRows count={8} />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : chapters && chapters.length > 0 ? (
            <ul className="space-y-2.5">
              {chapters.map((chapter) => (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  classId={classId}
                  isUnlocked={unlocked}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No study material available yet."
              description="Chapters for this subject are still being added."
              action={{ label: 'Back to subjects', to: `/classes/${classId}/subjects` }}
            />
          )}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink
            to={`/classes/${classId}/subjects`}
            variant="outline"
            size="md"
            leadingIcon={<BookOpen className="size-4" aria-hidden />}
          >
            All subjects
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
