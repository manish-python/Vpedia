import { useMemo, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'

import { PageHeading } from '@/layouts/AppLayout'
import { SegmentedControl } from '@/components/content/ContentFilter'
import { ActiveBadge } from '@/components/common/Badge'
import { ButtonLink } from '@/components/common/Button'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { SkeletonLibrary } from '@/components/common/Skeleton'
import { EmptyIllustration } from '@/components/illustrations/Illustrations'
import { ClassArtwork } from '@/components/illustrations/ClassArtwork'
import { useAsync, useSeo } from '@/hooks'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchLibrary } from '@/services/libraryService'
import { cn } from '@/utils/cn'
import { formatDate, formatINR } from '@/utils/format'
import type { LibraryClassEntry, LibraryTab } from '@/types'

/* ========================================================================
   My Library
   =================================================================== */

const TABS = [
  { value: 'all' as const, label: 'All Materials' },
  { value: 'notes' as const, label: 'Notes' },
  { value: 'pyqs' as const, label: 'PYQs' },
  { value: 'practice' as const, label: 'Practice Papers' },
]

export function LibraryPage() {
  const [tab, setTab] = useState<LibraryTab>('all')
  const { purchases } = usePurchase()

  // Unlocked class ids come from the server's purchase records, so the
  // library can never show something as owned that the backend disagrees with.
  const unlockedIds = useMemo(
    () => purchases.filter((p) => p.status === 'success').map((p) => p.classId),
    [purchases],
  )

  const { data, isLoading, error, refetch } = useAsync<LibraryClassEntry[]>(
    (signal) => fetchLibrary(unlockedIds, signal),
    [unlockedIds.join(',')],
  )

  useSeo({
    title: 'My Library',
    description: 'All your purchased classes and saved materials.',
    path: '/library',
    noIndex: true,
  })

  const entries = data ?? []
  const purchased = entries.filter((entry) => entry.isPurchased)

  // Non-"all" tabs narrow to purchased classes only — an unpurchased class
  // holds no materials to filter.
  const visible = tab === 'all' ? entries : purchased

  return (
    <div className="space-y-6">
      <PageHeading title="My Library" subtitle="All your purchased classes and saved materials." />

      <SegmentedControl
        ariaLabel="Library filter"
        value={tab}
        onChange={setTab}
        options={TABS}
        className="mt-2"
      />

      {isLoading ? (
        <SkeletonLibrary />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : visible.length === 0 ? (
        <EmptyState
          illustration={<EmptyIllustration size={170} />}
          title="Your Library is Empty"
          description="Purchase a class to start building your study library."
          action={{ label: 'Explore Classes', to: '/classes' }}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((entry) => (
            <LibraryRow key={entry.classId} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Row
   ------------------------------------------------------------------ */

function LibraryRow({ entry }: { entry: LibraryClassEntry }) {
  const { vClass, isPurchased, materialCount, purchasedAt, price } = entry

  return (
    <li
      className={cn(
        'rounded-2xl border bg-white shadow-card transition-[box-shadow,border-color] duration-200',
        isPurchased ? 'border-hairline hover:border-brand-300 hover:shadow-card-hover' : 'border-ink-200/70',
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <span
          aria-hidden
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl',
            isPurchased ? 'bg-brand-50' : 'bg-grape-50',
          )}
        >
          <ClassArtwork classId={vClass.id} size={40} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.0625rem] font-bold text-ink-900">{vClass.name}</h2>
            {isPurchased ? (
              <ActiveBadge />
            ) : (
              <span className="text-xs font-semibold text-ink-500">Not Purchased</span>
            )}
          </div>

          {isPurchased ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-500">
              <span className="font-medium text-ink-700 nums">{materialCount} Materials</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden />
                Purchased on {formatDate(purchasedAt)}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-500">
              Get complete access at{' '}
              <span className="font-semibold text-ink-800 nums">{formatINR(price)}</span>
            </p>
          )}
        </div>

        <div className="shrink-0 sm:w-32">
          {isPurchased ? (
            <ButtonLink
              to={`/classes/${vClass.id}/subjects`}
              size="md"
              fullWidth
              trailingIcon={<ArrowRight className="size-4" aria-hidden />}
            >
              Explore
            </ButtonLink>
          ) : (
            <ButtonLink to={`/classes/${vClass.id}`} variant="secondary" size="md" fullWidth>
              Buy Now
            </ButtonLink>
          )}
        </div>
      </div>
    </li>
  )
}
