import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/utils/cn'
import type { Chapter } from '@/types'

/* ========================================================================
   Chapter row
   Numbered list entry used on the chapter page. Reusable across subjects
   and classes — no per-subject variants exist.
   ===================================================================== */

export interface ChapterCardProps {
  chapter: Chapter
  classId: number
  isUnlocked?: boolean
  className?: string
}

export function ChapterCard({ chapter, classId, isUnlocked = true, className }: ChapterCardProps) {
  return (
    <li>
      <Link
        to={isUnlocked ? `/chapters/${chapter.id}/content` : `/classes/${classId}`}
        aria-current={undefined}
        className={cn(
          'group flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-card',
          'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
          isUnlocked ? 'border-hairline hover:border-brand-300' : 'border-ink-200/70',
          className,
        )}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700"
        >
          {chapter.number}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold text-ink-900">{chapter.name}</span>
          {chapter.blurb ? (
            <span className="mt-0.5 block truncate text-sm text-ink-500">{chapter.blurb}</span>
          ) : null}
        </span>

        <ChevronRight
          aria-hidden
          className="size-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
        />
      </Link>
    </li>
  )
}
