/* ========================================================================
   Notification Center — /admin-panel/notifications

   The full feed, with tabs and the two read-state actions. Every row links
   straight to the record it describes, so "review payment" lands on that
   payment rather than on the queue's first page.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCheck, Inbox } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { NotificationRow } from '@/admin/components/Notifications'
import { announceFeedChanged } from '@/admin/components/notificationStyle'
import { adminNotifications, markAllNotificationsRead } from '@/admin/service'
import type { AdminNotification, NotificationGroup } from '@/admin/types'
import { DataTable, ErrorState, PageHeader, Pagination, Toolbar, plural } from '@/admin/ui'
import { cn } from '@/utils/cn'

const PAGE_SIZE = 25

const TABS: Array<{ key: NotificationGroup; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'payments', label: 'Payments' },
  { key: 'students', label: 'Students' },
  { key: 'system', label: 'System' },
]

export function AdminNotificationsPage() {
  const { push } = useToast()
  const [group, setGroup] = useState<NotificationGroup>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminNotification[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const debouncedSearch = useDebounce(search, 350)

  // `unread` is a boolean filter, `group` is a server-side type grouping; both
  // live on the query so paging stays correct.
  const query = useMemo(() => {
    const params: Record<string, string | number> = { page, page_size: PAGE_SIZE }
    if (group === 'unread') params.unread = 'true'
    if (group !== 'all' && group !== 'unread') params.group = group
    if (debouncedSearch) params.search = debouncedSearch
    return params
  }, [group, page, debouncedSearch])

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      adminNotifications(query, signal)
        .then((response) => {
          setRows(response.results)
          setCount(response.count)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Could not load notifications.')
        })
        .finally(() => setLoading(false))
    },
    [query],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1)
  }, [group, debouncedSearch])

  const markAll = async () => {
    setBusy(true)
    try {
      const result = await markAllNotificationsRead()
      push({
        tone: 'success',
        title: result > 0 ? `${plural(result, 'notification')} marked as read` : 'Nothing left to read',
      })
      load()
      // The header bell counts the same rows; tell it to reload now rather
      // than leaving a stale badge for up to a poll interval.
      announceFeedChanged()
    } catch (cause) {
      push({
        tone: 'error',
        title: 'Could not mark notifications as read',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Every registration, payment and publication, as it happened."
        action={
          <Button
            onClick={() => void markAll()}
            loading={busy}
            disabled={busy}
            leadingIcon={<CheckCheck className="size-4" />}
          >
            Mark all as read
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-white p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setGroup(tab.key)}
            aria-current={group === tab.key ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-lg px-3.5 py-2 text-sm font-bold transition',
              group === tab.key
                ? 'bg-brand-600 text-white'
                : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search notifications…"
        onClear={() => {
          setSearch('')
          setGroup('all')
        }}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : (
        <DataTable<AdminNotification>
          columns={[
            {
              key: 'notification',
              header: 'Notification',
              cell: (note) => <NotificationCell note={note} onChange={() => load()} />,
              className: 'w-full',
            },
          ]}
          rows={rows}
          rowKey={(note) => note.id}
          loading={loading}
          empty={
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
              <Inbox className="mx-auto size-8 text-ink-300" aria-hidden />
              <p className="mt-3 font-bold text-ink-700">No notifications here</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
                {group === 'unread'
                  ? 'Everything has been read. Switch to All to see the full history.'
                  : 'New registrations, payment requests and publications will appear here.'}
              </p>
            </div>
          }
        />
      )}

      {!error && !loading ? (
        <Pagination page={page} pageCount={pageCount} onChange={setPage} total={count} />
      ) : null}
    </>
  )
}

function NotificationCell({
  note,
  onChange,
}: {
  note: AdminNotification
  onChange: () => void
}) {
  return <NotificationRow note={note} onChange={onChange} />
}