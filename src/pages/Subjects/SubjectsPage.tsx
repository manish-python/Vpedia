import { useParams, useSearchParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { UnlockedBadge } from '@/components/common/Badge'
import { ButtonLink } from '@/components/common/Button'
import { SubjectCard } from '@/components/cards/SubjectCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/EmptyState'
import { SkeletonSubjectGrid } from '@/components/common/Skeleton'
import type { ClassId, Stream, StreamId, Subject } from '@/types'
import { useAsync, useSeo } from '@/hooks'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchStreams } from '@/services/classService'
import { resolveClass } from '@/services/resolveService'
import { fetchSubjects } from '@/services/subjectService'
import { CLASS_NUMBERS } from '@/data/presentation'

/* ========================================================================
   Subjects for a class
   Locked classes never list their subjects — the route guard handles the
   redirect, and this page also guards itself.
   =================================================================== */

export function SubjectsPage() {
  const { classId: classIdParam } = useParams<{ classId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isUnlocked } = usePurchase()

  const classId = Number(classIdParam)
  const valid = CLASS_NUMBERS.includes(classId as ClassId)
  const streamId = (searchParams.get('stream') as StreamId | null) ?? null

  const { data: vClass } = useAsync(
    (signal) => (valid ? resolveClass(classId as ClassId, signal) : Promise.resolve(null)),
    [classId],
    { enabled: valid },
  )

  const needsStream = Boolean(vClass?.hasStreams) && !streamId

  const { data: streams } = useAsync<Stream[]>(
    (signal) => fetchStreams(classId as ClassId, signal),
    [classId],
    { enabled: valid && Boolean(vClass?.hasStreams) },
  )

  const { data: subjects, isLoading, error, refetch } = useAsync<Subject[]>(
    (signal) => fetchSubjects(classId as ClassId, streamId, signal),
    [classId, streamId],
    { enabled: valid && !needsStream },
  )

  const unlocked = isUnlocked(classId as ClassId)

  useSeo({
    title: vClass ? `${vClass.name} Subjects` : 'Subjects',
    description: `Browse every subject in ${vClass?.name ?? 'your class'} on VPEDIA LEARNING.`,
    path: `/classes/${classId}/subjects`,
    noIndex: true,
  })

  if (!valid) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Class not found"
          description="We only support Classes 7 to 12."
          action={{ label: 'Choose a class', to: '/classes' }}
        />
      </div>
    )
  }

  // A locked class is sent to its own detail page, where the purchase CTA lives.
  if (!unlocked) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Access Restricted"
          description={`You need to purchase ${vClass?.name ?? 'this class'} to see its subjects.`}
          action={{ label: `Purchase ${vClass?.name ?? 'class'}`, to: `/classes/${classId}` }}
          secondaryAction={{ label: 'Go to Dashboard', to: '/dashboard' }}
        />
      </div>
    )
  }

  const breadcrumb = [
    { label: 'Home', to: '/' },
    { label: vClass?.name ?? `Class ${classId}`, to: `/classes/${classId}` },
    { label: 'Subjects' },
  ]

  return (
    <div className="pb-16">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-6">
          <Breadcrumb items={breadcrumb} />
        </div>
      </div>

      <div className="container-page py-8 lg:py-10">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl sm:text-4xl">{vClass?.name ?? `Class ${classId}`}</h1>
          <UnlockedBadge />
        </header>
        <p className="mt-2 text-ink-500">Explore all subjects and start learning.</p>

        {/* Stream filter for 11 / 12 */}
        {vClass?.hasStreams ? (
          <div className="mt-6">
            <h2 id="stream-filter" className="text-sm font-bold text-ink-700">
              Stream
            </h2>
            <div
              role="group"
              aria-labelledby="stream-filter"
              className="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1"
            >
              {(streams ?? []).map((stream) => {
                const isActive = streamId === stream.id
                return (
                  <button
                    key={stream.id}
                    type="button"
                    onClick={() => setSearchParams({ stream: stream.id })}
                    aria-pressed={isActive}
                    className={`h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-brand'
                        : 'border border-hairline bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700'
                    }`}
                  >
                    {stream.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          {needsStream ? (
            <EmptyState
              title="Choose your stream"
              description={`${vClass?.name ?? 'This class'} is organised by stream. Pick one to see its subjects.`}
              action={
                streams?.[0]
                  ? { label: `Show ${streams[0].name}`, onClick: () => setSearchParams({ stream: streams[0]!.id }) }
                  : undefined
              }
            />
          ) : isLoading ? (
            <SkeletonSubjectGrid count={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : subjects && subjects.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <SubjectCard subject={subject} isUnlocked={unlocked} className="h-full" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No study material available yet."
              description="Subjects for this class are still being added."
              action={{ label: 'Browse other classes', to: '/classes' }}
            />
          )}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink to={`/pyqs/${subjects?.[0]?.id ?? 'c10-math'}`} variant="outline" size="md">
            View previous year questions
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
