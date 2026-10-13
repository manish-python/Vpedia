import { Link } from 'react-router-dom'
import { ChevronRight, Lock } from 'lucide-react'

import { getSubjectIcon } from '@/utils/icons'
import { getAccent } from '@/utils/accent'
import { cn } from '@/utils/cn'
import { pluralise } from '@/utils/format'
import type { Subject } from '@/types'

/* ========================================================================
   Subject card
   ===================================================================== */

export interface SubjectCardProps {
  subject: Subject
  isUnlocked: boolean
  className?: string
}

export function SubjectCard({ subject, isUnlocked, className }: SubjectCardProps) {
  const Icon = getSubjectIcon(subject.icon)
  const accent = getAccent(subject.accent)

  return (
    <Link
      to={`/classes/${subject.classId}/subjects/${subject.id}/chapters`}
      aria-label={`${subject.name}, ${pluralise(subject.chapterCount, 'chapter')}${isUnlocked ? '' : ', locked'}`}
      className={cn(
        'group flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-card sm:p-5',
        'transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:shadow-card-hover',
        isUnlocked ? cn('border-hairline', accent.ring) : 'border-ink-200/70 hover:border-ink-300',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl sm:size-12',
          isUnlocked ? accent.tile : 'bg-ink-100',
        )}
      >
        {isUnlocked ? (
          <Icon className={cn('size-5.5 sm:size-6', accent.text)} strokeWidth={2} />
        ) : (
          <Lock className="size-5 text-ink-400" strokeWidth={2.2} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-bold text-ink-900 sm:text-base">
          {subject.name}
        </span>
        <span className="mt-0.5 block text-sm text-ink-500">
          {pluralise(subject.chapterCount, 'chapter')}
        </span>
      </span>

      {isUnlocked ? (
        <ChevronRight
          aria-hidden
          className="size-5 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
        />
      ) : (
        <span className="shrink-0 text-xs font-semibold text-ink-500">Locked</span>
      )}
    </Link>
  )
}
