import { useMemo, useState, type ReactNode } from 'react'
import { FileText, Search } from 'lucide-react'

import { PageHeading } from '@/layouts/AppLayout'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { SkeletonRows } from '@/components/common/Skeleton'
import { ButtonLink } from '@/components/common/Button'
import { useAsync, useSeo } from '@/hooks'
import {
  fetchOtherResources,
  fetchResourceCategories,
  toResourceCard,
  type ResourceCard,
} from '@/services/resourceService'
import { cn } from '@/utils/cn'

/* ========================================================================
   Other Resources — student list
   ---------------------------------------------------------------------
   A second content system, separate from the class syllabus. Nothing here is
   tied to a purchase: the backend returns published resources to any
   signed-in student, and `PurchaseContext` is deliberately not consulted.

   Categories come from the API rather than a hardcoded list, so an
   administrator can add one without a frontend change.
   =================================================================== */

export function OtherResourcesPage() {
  const [category, setCategory] = useState<string>('')
  const [term, setTerm] = useState('')

  const categories = useAsync((signal) => fetchResourceCategories(signal), [])
  const resources = useAsync(
    (signal) => fetchOtherResources({ category, search: term.trim(), signal }),
    [category, term],
    { enabled: true },
  )

  useSeo({
    title: 'Other Resources',
    description:
      'Explore useful educational resources beyond your class syllabus — coding, career guidance, competitive exam preparation and more.',
    path: '/other-resources',
  })

  const cards: ResourceCard[] = useMemo(
    () => (resources.data ?? []).map(toResourceCard),
    [resources.data],
  )

  const categoryList = categories.data ?? []

  return (
    <div className="space-y-7">
      <PageHeading
        title="Other Resources"
        subtitle="Explore useful educational resources beyond your class syllabus."
      />

      {/* Category filter */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        <FilterChip active={category === ''} onClick={() => setCategory('')}>
          All
        </FilterChip>
        {categoryList.map((item) => (
          <FilterChip
            key={item.id}
            active={category === item.slug}
            onClick={() => setCategory(item.slug)}
          >
            {item.name}
            {item.resource_count > 0 ? (
              <span className="ml-1.5 text-xs opacity-70 nums">{item.resource_count}</span>
            ) : null}
          </FilterChip>
        ))}
      </div>

      {/* Search */}
      <div className="flex max-w-md items-center gap-2 rounded-xl border border-hairline bg-white px-3">
        <Search className="size-4 shrink-0 text-ink-400" aria-hidden />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search resources..."
          aria-label="Search other resources"
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-400"
        />
      </div>

      {resources.isLoading ? (
        <SkeletonRows count={4} />
      ) : resources.error ? (
        <ErrorState
          title="Unable to load resources"
          message="Failed to load resources. Please try again."
          onRetry={resources.refetch}
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8 text-ink-300" aria-hidden />}
          title={
            category || term
              ? 'No resources found for this category.'
              : 'No other resources available yet.'
          }
          description={
            category || term
              ? 'Try a different category or clear your search.'
              : 'Resources outside the class syllabus will appear here once an administrator publishes them.'
          }
          action={
            category || term
              ? {
                  label: 'Show all resources',
                  onClick: () => {
                    setCategory('')
                    setTerm('')
                  },
                }
              : { label: 'Browse classes', to: '/classes' }
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id}>
              <ResourceCardView card={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
        active
          ? 'bg-brand-600 text-white'
          : 'bg-white text-ink-600 hover:bg-ink-50 hover:text-ink-900',
      )}
    >
      {children}
    </button>
  )
}

export function ResourceCardView({ card }: { card: ResourceCard }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-hairline bg-white p-5 transition-shadow hover:shadow-card">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
        >
          <FileText className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base leading-snug font-bold text-ink-900">{card.title}</h2>
          <p className="mt-1 text-xs font-semibold text-brand-700">{card.categoryName}</p>
        </div>
      </div>

      {card.description ? (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-600">
          {card.description}
        </p>
      ) : null}

      <div className="mt-4 pt-1">
        <ButtonLink to={`/other-resources/${card.slug}`} size="sm" variant="soft">
          View Resource
        </ButtonLink>
      </div>
    </article>
  )
}