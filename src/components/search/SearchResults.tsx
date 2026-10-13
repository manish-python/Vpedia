import { Link } from 'react-router-dom'
import { BookOpen, FileText, Lock } from 'lucide-react'

import { getContentTypeMeta } from '@/data/contentTypes'
import { EmptyState } from '@/components/common/EmptyState'
import { getAccent } from '@/utils/accent'
import { cn } from '@/utils/cn'
import type { SearchHit, SearchEntityKind } from '@/types'
import { SearchIllustration } from '@/components/illustrations/Illustrations'

/* ========================================================================
   SearchResults
   Every hit shows title, class, subject, chapter, content type and access
   status, so a student can judge relevance before opening anything.
   =================================================================== */

const KIND_META: Record<SearchEntityKind, { label: string; icon: typeof BookOpen }> = {
  subject: { label: 'Subject', icon: BookOpen },
  chapter: { label: 'Chapter', icon: BookOpen },
  content: { label: 'Material', icon: FileText },
}

export function SearchResults({
  hits,
  isLoading = false,
  className,
}: {
  hits: SearchHit[]
  isLoading?: boolean
  className?: string
}) {
  if (isLoading) {
    return (
      <ul role="status" aria-label="Searching" className={cn('space-y-2.5', className)}>
        {Array.from({ length: 5 }, (_, i) => (
          <li
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-hairline bg-white p-4"
          >
            <div className="skeleton-base size-11 shrink-0 rounded-xl" />
            <div className="flex-1">
              <div className="skeleton-base h-4 w-1/3" />
              <div className="skeleton-base mt-2 h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (hits.length === 0) {
    return (
      <EmptyState
        size="sm"
        illustration={<SearchIllustration size={150} />}
        title="No results found"
        description="Try another search."
      />
    )
  }

  return (
    <ul className={cn('space-y-2.5', className)}>
      {hits.map((hit) => (
        <SearchResult key={`${hit.kind}-${hit.id}`} hit={hit} />
      ))}
    </ul>
  )
}

export function SearchResult({ hit }: { hit: SearchHit }) {
  const kind = KIND_META[hit.kind]
  const KindIcon = kind.icon
  const typeMeta = hit.contentType ? getContentTypeMeta(hit.contentType) : null
  const TypeIcon = typeMeta?.icon
  const accent = getAccent(hit.kind === 'subject' ? 'blue' : 'purple')

  return (
    <li>
      <Link
        to={hit.href}
        className={cn(
          'group flex items-start gap-4 rounded-2xl border bg-white p-4 shadow-card',
          'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
          hit.isLocked ? 'border-ink-200/70' : 'border-hairline hover:border-brand-300',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            hit.isLocked ? 'bg-ink-100' : accent.tile,
          )}
        >
          {hit.isLocked ? (
            <Lock className="size-5 text-ink-400" strokeWidth={2.2} />
          ) : (
            <KindIcon className={cn('size-5.5', accent.text)} strokeWidth={2} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[0.9375rem] font-bold text-ink-900">{hit.title}</span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[0.625rem] font-bold text-ink-600">
              Class {hit.classId}
            </span>
            {hit.contentType && typeMeta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold',
                  typeMeta.tile,
                )}
              >
                {TypeIcon ? <TypeIcon className="size-3" aria-hidden /> : null}
                {typeMeta.label}
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold',
                hit.isLocked ? 'bg-ink-100 text-ink-600' : 'bg-leaf-50 text-leaf-700',
              )}
            >
              {hit.isLocked ? (
                <>
                  <Lock className="size-3" aria-hidden />
                  Locked
                </>
              ) : (
                'Unlocked'
              )}
            </span>
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-500">
            <span className="font-medium">{kind.label}</span>
            <span aria-hidden>·</span>
            <span>{hit.subjectName}</span>
            {hit.chapterName ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{hit.chapterName}</span>
              </>
            ) : null}
          </span>
        </span>

        {hit.isLocked ? (
          <span className="hidden shrink-0 self-center text-xs font-semibold text-ink-500 sm:block">
            Purchase to unlock
          </span>
        ) : null}
      </Link>
    </li>
  )
}

/* ---------------------------------------------------------------------
   SearchEmptyState
   ------------------------------------------------------------------ */

export function SearchEmptyState({
  hasQuery,
  onClear,
}: {
  hasQuery: boolean
  onClear: () => void
}) {
  if (hasQuery) {
    return (
      <EmptyState
        size="sm"
        illustration={<SearchIllustration size={150} />}
        title="No results found"
        description="Try another search."
        action={{ label: 'Clear search', onClick: onClear }}
      />
    )
  }

  return (
    <EmptyState
      size="sm"
      illustration={<SearchIllustration size={150} />}
      title="Search your study material"
      description="Find subjects, chapters, notes, PYQs and practice papers by name."
      action={{ label: 'Browse classes', to: '/classes' }}
    />
  )
}
