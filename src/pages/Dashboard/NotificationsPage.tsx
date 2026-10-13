import { Bell, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeading } from '@/layouts/AppLayout'
import { EmptyState, ErrorState } from '@/components/common/EmptyState'
import { SkeletonRows } from '@/components/common/Skeleton'
import { EmptyIllustration } from '@/components/illustrations/Illustrations'
import { useAsync, useSeo } from '@/hooks'
import { fetchNotifications } from '@/services/authService'
import { formatRelative } from '@/utils/format'
import type { AppNotification } from '@/types'

/* ========================================================================
   Notifications
   A thin view over the same data the top-bar bell dropdown loads.
   =================================================================== */

export function NotificationsPage() {
  const { data, isLoading, error, refetch } = useAsync<AppNotification[]>(
    (signal) => fetchNotifications(signal),
    [],
  )

  useSeo({
    title: 'Notifications',
    description: 'Your VPEDIA LEARNING notifications.',
    path: '/dashboard/notifications',
    noIndex: true,
  })

  return (
    <div className="space-y-6">
      <PageHeading
        title="Notifications"
        subtitle="Product updates and your purchase activity."
      />

      {isLoading ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : data && data.length > 0 ? (
        <ul className="space-y-2.5">
          {data.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-4 rounded-2xl border border-hairline bg-white p-4 shadow-card"
            >
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
              >
                <Bell className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[0.9375rem] font-bold text-ink-900">{item.title}</h2>
                  {!item.read ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[0.625rem] font-bold text-brand-700">
                      New
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-ink-400">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {formatRelative(item.createdAt)}
                </p>
              </div>

              {item.href ? (
                <Link
                  to={item.href}
                  className="shrink-0 self-center rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          illustration={<EmptyIllustration size={160} />}
          title="Nothing here yet"
          description="Updates about new material and your purchases will show up here."
          action={{ label: 'Browse classes', to: '/classes' }}
        />
      )}
    </div>
  )
}
