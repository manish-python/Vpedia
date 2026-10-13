import { Link } from 'react-router-dom'
import { FileText, Lock } from 'lucide-react'

import { getContentTypeMeta } from '@/data/contentTypes'
import { ContentFilter, ContentTabs } from '@/components/content'
import { cn } from '@/utils/cn'
import { pageLabel } from '@/utils/format'
import type { ContentItem } from '@/types'

/* ========================================================================
   ContentCard
   The single row used for every content type across chapter content, the
   notes viewer breadcrumb sheet and the PYQ page. Locked rows never link
   to a document — they route to the class purchase page instead.
   ===================================================================== */

export interface ContentCardProps {
  content: Pick<ContentItem, 'id' | 'title' | 'type' | 'pageCount' | 'description' | 'isLocked'>
  /** Optional override for the row's meta line. */
  meta?: string
  classId?: number
  className?: string
}

export function ContentCard({ content, meta, classId, className }: ContentCardProps) {
  const typeMeta = getContentTypeMeta(content.type)
  const Icon = typeMeta.icon
  const isLocked = content.isLocked
  const href = isLocked ? `/classes/${classId ?? 10}` : `/notes/${content.id}`

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-card sm:flex-row sm:items-center sm:gap-4',
        'transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover',
        isLocked ? 'border-ink-200/70' : 'border-hairline hover:border-brand-300',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          isLocked ? 'bg-ink-100' : typeMeta.tile,
        )}
      >
        {isLocked ? (
          <Lock className="size-5 text-ink-400" strokeWidth={2.2} />
        ) : (
          <Icon className={cn('size-5.5', typeMeta.text)} strokeWidth={2} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="text-[0.9375rem] font-bold text-ink-900 sm:text-base">{content.title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-ink-500 sm:text-sm">
          <FileText className="size-3.5" strokeWidth={2.4} aria-hidden />
          <span>
            {meta ??
              [pageLabel(content.pageCount), content.description]
                .filter(Boolean)
                .join(' · ')}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:w-24 sm:justify-end">
        {isLocked ? (
          <Link
            to={href}
            className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-ink-200 px-3 text-sm font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 sm:w-auto"
          >
            Unlock
          </Link>
        ) : (
          <Link
            to={href}
            className="inline-flex h-9 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-700 sm:w-auto"
          >
            View
          </Link>
        )}
      </div>
    </li>
  )
}

/* ---------------------------------------------------------------------
   ContentCard re-exported through the content barrel for convenience.
   The tabs and filter live in components/content so content-specific
   primitives are grouped together.
   ------------------------------------------------------------------ */
export { ContentFilter, ContentTabs }
