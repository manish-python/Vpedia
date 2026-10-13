/* ========================================================================
   Notification bell + dropdown + row

   Source of truth is the server. The header polls a single integer every 20
   seconds — cheap, one indexed `COUNT`, and enough for a portal this scale.
   Polling pauses while the tab is hidden, so a forgotten background tab costs
   nothing, and resumes the moment it is looked at again.

   Unread rows are distinguished by a dot *and* by the weight of their title,
   never by colour alone.
   ===================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, CheckCheck } from 'lucide-react'

import { Button } from '@/components/common/Button'
import {
  adminNotifications, adminUnreadCount, markAllNotificationsRead, markNotificationRead,
} from '@/admin/service'
import type { AdminNotification } from '@/admin/types'
import { ErrorState, absoluteTime, relativeTime } from '@/admin/ui'
import { cn } from '@/utils/cn'
import { POLL_INTERVAL_MS, FEED_CHANGED_EVENT, announceFeedChanged, notificationStyle } from './notificationStyle'

/* ---------------------------------------------------------------------
   Shared polling
   ------------------------------------------------------------------ */

interface FeedState {
  unread: number
  recent: AdminNotification[]
  loading: boolean
  error: string | null
}

/**
 * Keeps the unread count and the newest rows in step.
 *
 * `refresh` lets a caller force an immediate reload after an action elsewhere
 * in the portal, instead of waiting for the next tick.
 */
export function useNotificationFeed(limit = 5) {
  const [state, setState] = useState<FeedState>({
    unread: 0,
    recent: [],
    loading: true,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        const [unread, page] = await Promise.all([
          adminUnreadCount(controller.signal),
          adminNotifications({ page_size: limit }, controller.signal),
        ])
        if (controller.signal.aborted || !alive.current) return
        setState({ unread, recent: page.results, loading: false, error: null })
      } catch (cause) {
        if (controller.signal.aborted || !alive.current) return
        setState((previous) => ({
          ...previous,
          loading: false,
          // A failed poll must not wipe a working bell or raise a toast every
          // 20 seconds; the error only surfaces where a person is looking.
          error: cause instanceof Error ? cause.message : 'Could not load notifications.',
        }))
      }
    }

    void load()

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void load()
    }, POLL_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    // Another part of the portal changed the read state; catch up at once
    // instead of waiting for the next poll tick.
    window.addEventListener(FEED_CHANGED_EVENT, load)

    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener(FEED_CHANGED_EVENT, load)
    }
  }, [limit, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  return { ...state, refresh }
}

/* ---------------------------------------------------------------------
   Bell
   ------------------------------------------------------------------ */

export function NotificationBell({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { unread, recent, loading, error, refresh } = useNotificationFeed()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'}
        className="relative flex size-10 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Bell className="size-5" aria-hidden />
        {/* No badge at zero: an empty "0" is noise. */}
        {unread > 0 ? (
          <span
            className="nums absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[0.625rem] font-black leading-5 text-white ring-2 ring-white"
            aria-hidden
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] origin-top-right animate-pop-in overflow-hidden rounded-2xl border border-hairline bg-white shadow-pop"
        >
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-bold text-ink-900">Notifications</h2>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead().then(() => { announceFeedChanged(); refresh() })}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-50"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {loading && !recent.length ? (
              <p className="px-4 py-8 text-center text-sm text-ink-400">Loading…</p>
            ) : error && !recent.length ? (
              <div className="p-3">
                <ErrorState compact message={error} onRetry={refresh} />
              </div>
            ) : recent.length === 0 ? (
              <p className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-ink-400">
                <BellOff className="size-6" aria-hidden />
                You are all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recent.map((note) => (
                  <DropdownRow
                    key={note.id}
                    note={note}
                    onClose={() => setOpen(false)}
                    onNavigate={onNavigate}
                    onChange={refresh}
                  />
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNavigate?.()
            }}
            className="w-full border-t border-hairline bg-ink-50/60 px-4 py-2.5 text-sm font-bold text-brand-700 transition hover:bg-brand-50"
          >
            View all notifications
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DropdownRow({
  note,
  onClose,
  onNavigate,
  onChange,
}: {
  note: AdminNotification
  onClose: () => void
  onNavigate?: () => void
  onChange: () => void
}) {
  const navigate = useNavigate()
  const style = notificationStyle(note.type)
  const Icon = style.icon

  const open = () => {
    // Opening counts as reading, so the badge stops nagging about something
    // that has just been acted on.
    if (!note.is_read) void markNotificationRead(note.id).then(onChange)
    onClose()
    onNavigate?.()
    if (note.link) navigate(note.link)
  }

  return (
    <li>
      <button
        type="button"
        role="menuitem"
        onClick={open}
        className={cn(
          'flex w-full gap-3 px-4 py-3 text-left transition hover:bg-brand-50/50 focus-visible:bg-brand-50/50',
          note.is_read ? 'bg-white' : 'bg-brand-50/30',
        )}
      >
        {/* Dot marks unread; a matching blank span keeps read rows aligned. */}
        <span
          aria-hidden
          className={cn(
            'mt-1.5 size-2 shrink-0 rounded-full',
            note.is_read ? 'bg-transparent' : 'bg-brand-600',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn('flex size-6 shrink-0 items-center justify-center rounded-lg', style.chip)}
            >
              <Icon className="size-3.5" />
            </span>
            <span
              className={cn(
                'truncate text-sm',
                note.is_read ? 'font-semibold text-ink-600' : 'font-bold text-ink-900',
              )}
            >
              {note.title}
            </span>
          </span>
          {note.message ? (
            <span className="mt-1 block truncate text-xs text-ink-500">{note.message}</span>
          ) : null}
          <span className="mt-1 block text-xs font-semibold text-ink-400">
            {relativeTime(note.created_at)}
            {!note.is_read ? ' · Unread' : ''}
          </span>
        </span>
      </button>
    </li>
  )
}

/* ---------------------------------------------------------------------
   Full row, used by the Notification Center
   ------------------------------------------------------------------ */

export function NotificationRow({
  note,
  compact = false,
  onChange,
}: {
  note: AdminNotification
  compact?: boolean
  /** Called after the read flag changes, so the list can re-fetch. */
  onChange?: () => void
}) {
  const navigate = useNavigate()
  const style = notificationStyle(note.type)
  const Icon = style.icon

  const open = async () => {
    if (!note.is_read) {
      await markNotificationRead(note.id).catch(() => undefined)
      announceFeedChanged()
      onChange?.()
    }
    if (note.link) navigate(note.link)
  }

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border bg-white p-4 shadow-sm transition',
        note.is_read ? 'border-hairline' : 'border-brand-200 bg-brand-50/30',
      )}
    >
      <span
        aria-hidden
        className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', style.chip)}
      >
        <Icon className="size-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p
            className={cn('text-sm', note.is_read ? 'font-semibold text-ink-700' : 'font-bold text-ink-900')}
          >
            {note.title}
            {!note.is_read ? (
              <span className="ml-2 rounded-full bg-brand-600 px-1.5 py-0.5 text-[0.625rem] font-black uppercase tracking-wide text-white">
                New
              </span>
            ) : null}
          </p>
          <time
            dateTime={note.created_at}
            title={absoluteTime(note.created_at)}
            className="shrink-0 text-xs font-semibold text-ink-400"
          >
            {relativeTime(note.created_at)}
          </time>
        </div>

        {note.message ? (
          <p className={cn('mt-1 text-sm text-ink-600', compact && 'line-clamp-2')}>{note.message}</p>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {note.link ? (
            <Button size="sm" variant="soft" onClick={() => void open()}>
              {style.action ?? 'Open'}
            </Button>
          ) : null}
          {!note.is_read ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void markNotificationRead(note.id).then(() => {
                  announceFeedChanged()
                  onChange?.()
                })
              }
            >
              Mark as read
            </Button>
          ) : (
            <span className="text-xs font-semibold text-ink-400">Read</span>
          )}
          <span className="ml-auto text-xs font-semibold text-ink-400">{note.type_label}</span>
        </div>
      </div>
    </div>
  )
}