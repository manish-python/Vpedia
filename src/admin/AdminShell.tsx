/* ========================================================================
   Admin shell

   Sidebar + header + content, responsive at three breakpoints:

   * **Desktop (lg+)** — full sidebar, always visible.
   * **Tablet (md–lg)** — the same sidebar collapsed to a 68px icon rail, which
     keeps navigation reachable without eating half the screen. It expands over
     the content on hover/focus.
   * **Mobile (<md)** — no rail at all. A drawer slides in from the left.

   The header stays usable at every width: brand, notification bell, account
   name and logout never wrap or overlap. Nothing in the layout is allowed to
   cause horizontal page overflow, so tables become cards and charts reflow
   instead of scrolling sideways.
   ===================================================================== */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  Bell, BookOpen, ChevronLeft, FileText, GraduationCap, LayoutDashboard, LogOut,
  Menu, PanelLeft, Settings, ShieldCheck, ShoppingBag, Users, X, type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Loader } from '@/components/common/Spinner'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { NotificationBell } from '@/admin/components/Notifications'
import { adminLogin, adminLogout, adminMe } from '@/admin/service'
import type { AdminUser } from '@/admin/types'
import { ErrorState } from '@/admin/ui'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------
   Navigation
   ------------------------------------------------------------------ */

interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  /** Route relative to the admin root; the dashboard is the index. */
  to: string
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/admin-panel' },
  { key: 'students', label: 'Students', icon: Users, to: '/admin-panel/students' },
  { key: 'classes', label: 'Classes & pricing', icon: GraduationCap, to: '/admin-panel/classes' },
  { key: 'subjects', label: 'Subjects', icon: BookOpen, to: '/admin-panel/subjects' },
  { key: 'chapters', label: 'Chapters', icon: FileText, to: '/admin-panel/chapters' },
  { key: 'content', label: 'Content', icon: PanelLeft, to: '/admin-panel/content' },
  { key: 'payments', label: 'Payments', icon: ShieldCheck, to: '/admin-panel/payments' },
  { key: 'purchases', label: 'Purchases', icon: ShoppingBag, to: '/admin-panel/purchases' },
  { key: 'notifications', label: 'Notifications', icon: Bell, to: '/admin-panel/notifications' },
  { key: 'upi', label: 'UPI settings', icon: Settings, to: '/admin-panel/upi' },
]

/* ---------------------------------------------------------------------
   AdminApp
   ------------------------------------------------------------------ */

export function AdminApp({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useLockBodyScroll(drawerOpen)

  useEffect(() => {
    adminMe()
      .then(setUser)
      .catch((cause: unknown) => {
        setUser(null)
        // A 403 here means "signed in, but not staff" — worth saying plainly
        // rather than showing a bare login form as if nothing were wrong.
        setSessionError(
          cause instanceof Error && cause.message.toLowerCase().includes('permission')
            ? 'Your account is signed in but is not authorised for the admin panel.'
            : null,
        )
      })
      .finally(() => setChecking(false))
  }, [])

  const logout = async () => {
    try {
      await adminLogout()
    } finally {
      setUser(null)
      setDrawerOpen(false)
    }
  }

  // A drawer left open across a navigation would sit on top of the new page.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  if (checking) {
    return (
      <FullScreen>
        <Loader label="Checking administrator session…" />
      </FullScreen>
    )
  }

  if (!user) {
    return (
      <AdminLogin
        notice={sessionError}
        onSuccess={(next) => {
          setSessionError(null)
          setUser(next)
        }}
      />
    )
  }

  return (
    <div className="min-h-dvh bg-ink-50 text-ink-900">
      <AdminHeader
        user={user}
        onMenu={() => setDrawerOpen(true)}
        onLogout={() => void logout()}
      />

      {/* Desktop rail + tablet icon rail. `md:` collapses it, `lg:` reveals
          the full sidebar. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[68px] border-r border-hairline bg-white md:block lg:w-64">
        <SidebarContent user={user} />
      </aside>

      {drawerOpen ? (
        <MobileDrawer onClose={() => setDrawerOpen(false)} user={user} />
      ) : null}

      <main className="pt-16 md:pl-[68px] lg:pl-64">
        <div className="mx-auto max-w-[100rem] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */

function AdminHeader({
  user,
  onMenu,
  onLogout,
}: {
  user: AdminUser
  onMenu: () => void
  onLogout: () => void
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-hairline bg-white/95 px-3 backdrop-blur md:pl-[84px] lg:pl-[272px] sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open admin menu"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 md:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <Link to="/admin-panel" className="flex min-w-0 items-center gap-2">
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white sm:flex">
            V
          </span>
          <span className="truncate text-base font-black tracking-tight sm:text-lg">
            <span className="text-brand-700">VPEDIA</span>{' '}
            <span className="text-ink-900">ADMIN</span>
          </span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationBell />

        <div className="hidden items-center gap-2.5 rounded-xl border border-hairline py-1.5 pl-2.5 pr-3 sm:flex">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-black text-brand-700">
            {initials(user)}
          </span>
          <span className="leading-tight">
            <span className="block max-w-[9rem] truncate text-xs font-bold text-ink-900">
              {user.full_name || user.email}
            </span>
            <span className="block text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">
              Site Admin
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          className="flex size-10 items-center justify-center rounded-xl text-ink-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <LogOut className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------------
   Sidebar
   ------------------------------------------------------------------ */

function SidebarContent({ user, onNavigate }: { user: AdminUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      {/* Label sits in the 16rem header gutter on desktop so the two align. */}
      <div className="hidden h-16 shrink-0 items-center border-b border-hairline px-6 lg:flex">
        <span className="text-xs font-bold uppercase tracking-widest text-ink-400">Menu</span>
      </div>

      <nav aria-label="Admin navigation" className="flex-1 space-y-0.5 overflow-y-auto p-2 lg:p-3">
        {NAV.map(({ key, label, icon: Icon, to }) => (
          <NavLink
            key={key}
            to={to}
            end={to === '/admin-panel'}
            onClick={onNavigate}
            title={label}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl py-2.5 pl-4 pr-3 text-sm font-semibold transition',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                'justify-center lg:justify-start',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/*
                  Three active-state signals rather than colour alone: the
                  background tint, this accent bar, and the `aria-current` that
                  NavLink sets by itself. The bar is the one that still reads
                  below `lg`, where the label is hidden and the sidebar is
                  icon-only - without it, nine grey icons give no reliable
                  indication of where you are.
                */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon
                  aria-hidden
                  className={cn('size-5 shrink-0', isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600')}
                />
                <span className="hidden truncate lg:inline">{label}</span>
                {/* Icon-only on tablet; the accessible name comes from `title`
                    plus the visually hidden full label below. */}
                <span className="sr-only lg:hidden">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-hairline p-2 lg:p-3">
        <div className="hidden items-center gap-2.5 rounded-xl px-2 py-2 lg:flex">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-black text-brand-700">
            {initials(user)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-xs font-bold text-ink-900">
              {user.full_name || user.email}
            </span>
            <span className="block text-[0.625rem] font-semibold uppercase tracking-wide text-ink-400">
              Site Admin
            </span>
          </span>
        </div>

        <a
          href="/admin/"
          title="Django Admin fallback"
          className="mt-1 flex items-center justify-center gap-2.5 rounded-xl border-t border-hairline px-3 py-2.5 text-sm font-semibold text-ink-500 transition hover:bg-ink-50 hover:text-brand-700 lg:justify-start"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          <span className="hidden truncate lg:inline">Django Admin fallback</span>
          <span className="sr-only lg:hidden">Django Admin fallback</span>
        </a>
      </div>
    </div>
  )
}

function MobileDrawer({ onClose, user }: { onClose: () => void; user: AdminUser }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-900/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Admin menu"
        className="absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] animate-pop-in flex-col bg-white shadow-pop"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-4">
          <span className="text-base font-black tracking-tight">
            <span className="text-brand-700">VPEDIA</span> <span className="text-ink-900">ADMIN</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-9 items-center justify-center rounded-xl text-ink-500 transition hover:bg-ink-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarContent user={user} onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Login
   ------------------------------------------------------------------ */

function AdminLogin({
  onSuccess,
  notice,
}: {
  onSuccess: (user: AdminUser) => void
  notice: string | null
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSuccess(await adminLogin(email, password))
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.'
      setError(message)
      errorRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <FullScreen>
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl border border-hairline bg-white p-7 shadow-panel"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-xl font-black text-white">
            V
          </div>
          <h1 className="text-2xl font-black text-ink-900">VPEDIA Admin</h1>
          <p className="mt-1 text-sm text-ink-500">Authorised staff access only</p>
        </div>

        {notice ? (
          <div className="mb-4">
            <ErrorState message={notice} title="Access denied" compact />
          </div>
        ) : null}

        <label htmlFor="admin-email" className="block text-sm font-bold text-ink-800">
          Email
        </label>
        <input
          id="admin-email"
          required
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-hairline px-3 py-2.5 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
        />

        <label htmlFor="admin-password" className="mt-4 block text-sm font-bold text-ink-800">
          Password
        </label>
        <input
          id="admin-password"
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-hairline px-3 py-2.5 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
        />

        {error ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800 outline-none"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" loading={busy} fullWidth size="lg" className="mt-6">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <a href="/admin/" className="mt-4 block text-center text-xs font-semibold text-brand-700">
          Open Django Admin fallback
        </a>
      </form>
    </FullScreen>
  )
}

/* ---------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-ink-50 p-4">{children}</div>
}

function initials(user: AdminUser): string {
  const source = user.first_name || user.email
  const parts = source.trim().split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? 'A').concat(parts[1]?.[0] ?? '').toUpperCase()
}