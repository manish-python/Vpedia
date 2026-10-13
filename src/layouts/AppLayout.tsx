import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Search } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { Avatar } from '@/components/user/Avatar'
import { MobileBottomNav, Sidebar } from '@/components/navigation'
import { SearchBar } from '@/components/search/SearchBar'
import { useAuth } from '@/context/AuthContext'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { fetchNotifications } from '@/services/authService'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/format'
import type { AppNotification } from '@/types'

/* ========================================================================
   Student (authenticated) layout
   Sidebar on desktop, compact top bar + bottom navigation on mobile.
   =================================================================== */

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopBar />
          <main id="main" className="flex-1 px-4 pb-24 sm:px-6 lg:px-8 lg:pb-10">
            <div className="mx-auto w-full max-w-6xl py-6 sm:py-8">{children}</div>
          </main>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  )
}

/* ---------------------------------------------------------------------
   Top bar
   ------------------------------------------------------------------ */

function AppTopBar() {
  const { user } = useAuth()
  const [term, setTerm] = useState('')

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-white/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo only on mobile — the sidebar carries it on desktop */}
        <Link to="/dashboard" aria-label="VPEDIA LEARNING dashboard" className="lg:hidden">
          <Logo size={32} variant="inline" className="shrink-0" />
        </Link>

        <SearchBar
          value={term}
          onChange={setTerm}
          placeholder="Search for subjects, chapters, notes..."
          size="md"
          className="min-w-0 flex-1 lg:max-w-md"
        />

        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to="/search"
            aria-label="Search"
            className="inline-flex size-10 items-center justify-center rounded-xl text-ink-600 transition-colors hover:bg-ink-100 lg:hidden"
          >
            <Search className="size-5" aria-hidden />
          </Link>

          <NotificationBell />

          <Link
            to="/profile"
            aria-label="Your profile"
            className="ml-1 rounded-full transition-opacity hover:opacity-85"
          >
            <Avatar name={user?.name} avatarUrl={user?.avatarUrl} size="md" ring />
          </Link>
        </div>
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------------
   Notification bell
   ------------------------------------------------------------------ */

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useLockBodyScroll(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetchNotifications(controller.signal)
      .then(setItems)
      .catch(() => setItems([]))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const unread = items.filter((item) => !item.read).length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex size-10 items-center justify-center rounded-xl text-ink-600 transition-colors hover:bg-ink-100"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute right-2 top-2 size-2 rounded-full bg-rose-500 ring-2 ring-white"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] animate-pop-in overflow-hidden rounded-2xl border border-hairline bg-white shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-bold text-ink-900">Notifications</h2>
            {unread > 0 ? (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                {unread} new
              </span>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">Nothing here yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-hairline overflow-y-auto">
              {items.map((item) => {
                const body = (
                  <>
                    <span className="flex items-start gap-1.5">
                      {!item.read ? (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500"
                        />
                      ) : (
                        <span aria-hidden className="mt-1.5 size-2 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-900">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                          {item.body}
                        </span>
                        <span className="mt-1 block text-[0.6875rem] font-medium text-ink-400">
                          {formatRelative(item.createdAt)}
                        </span>
                      </span>
                    </span>
                  </>
                )

                return (
                  <li key={item.id} className={cn(item.read ? '' : 'bg-brand-50/40')}>
                    {item.href ? (
                      <Link
                        to={item.href}
                        onClick={() => setOpen(false)}
                        className="block px-4 py-3 transition-colors hover:bg-ink-50"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------
   PageHeading — shared page title block for the student area
   ------------------------------------------------------------------ */

export function PageHeading({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}
