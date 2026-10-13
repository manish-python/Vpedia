/* ========================================================================
   Notification presentation

   How each notification type looks and where its quick action leads.

   Kept apart from the components so this file exports no components, which
   keeps React Fast Refresh working, and so the wording can be reviewed in one
   place.

   The `action` label is deliberately not generic. "Review Payment" tells an
   administrator what will happen; "Open" does not.
   ===================================================================== */

import {
  Bell, FileCheck2, PackageCheck, Sparkles, UserPlus, XCircle, type LucideIcon,
} from 'lucide-react'

import type { NotificationType } from '@/admin/types'

export interface NotificationStyle {
  icon: LucideIcon
  /** Tailwind classes for the icon chip. */
  chip: string
  /** Button label for the notification's own action. */
  action?: string
}

const TYPE_STYLE: Record<NotificationType, NotificationStyle> = {
  NEW_STUDENT: { icon: UserPlus, chip: 'bg-brand-50 text-brand-700', action: 'View student' },
  PAYMENT_REQUEST: {
    icon: FileCheck2,
    chip: 'bg-amber-50 text-amber-700',
    action: 'Review payment',
  },
  PAYMENT_APPROVED: {
    icon: PackageCheck,
    chip: 'bg-emerald-50 text-emerald-700',
    action: 'View payment',
  },
  PAYMENT_REJECTED: {
    icon: XCircle,
    chip: 'bg-rose-50 text-rose-700',
    action: 'View payment',
  },
  CONTENT_PUBLISHED: {
    icon: Sparkles,
    chip: 'bg-grape-50 text-grape-700',
    action: 'View content',
  },
  RESOURCE_PUBLISHED: {
    icon: Sparkles,
    chip: 'bg-grape-50 text-grape-700',
    action: 'View content',
  },
  SYSTEM_ALERT: { icon: Bell, chip: 'bg-ink-100 text-ink-600' },
}

/** Never throws on an unrecognised type — new ones degrade to a plain bell. */
export function notificationStyle(type: NotificationType): NotificationStyle {
  return TYPE_STYLE[type] ?? TYPE_STYLE.SYSTEM_ALERT
}

/** How often the header re-checks the unread count while the tab is visible. */
export const POLL_INTERVAL_MS = 20_000

/**
 * Tell every mounted notification feed to reload now.
 *
 * The bell and the Notification Center are separate components with separate
 * fetches. Without a channel between them, "Mark all as read" would leave the
 * bell showing a stale count for up to a full poll interval, which reads as the
 * action having done nothing.
 *
 * A `window` event is the whole mechanism: no store, no context, nothing extra
 * to wire up in two places.
 */
export const FEED_CHANGED_EVENT = 'vpedia:notifications-changed'

export function announceFeedChanged(): void {
  window.dispatchEvent(new Event(FEED_CHANGED_EVENT))
}