import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

/* ========================================================================
   ProfileCard + ProfileRow
   Read-only identity rows. There is deliberately no password row: the only
   authentication method is Google OAuth.
   =================================================================== */

export function ProfileCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label="Profile details"
      className={cn(
        'divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-white shadow-card',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function ProfileRow({
  label,
  value,
  children,
}: {
  label: string
  value?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <dt className="shrink-0 text-sm font-medium text-ink-600 sm:text-[0.9375rem]">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold break-words text-ink-900 sm:text-[0.9375rem]">
        {children ?? value}
      </dd>
    </div>
  )
}
