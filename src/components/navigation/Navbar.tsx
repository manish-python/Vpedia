import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid, LogOut, Menu, X } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { Button, ButtonLink, GoogleIcon } from '@/components/common'
import { useAuth } from '@/context/AuthContext'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { NAV_LINKS } from '@/data/marketing'
import { cn } from '@/utils/cn'

/* ========================================================================
   Public navbar
   Logo Â· five links Â· one action. Deliberately uncrowded: below 1024px the
   links collapse into a drawer so nothing is ever cramped.
   ===================================================================== */

export function Navbar() {
  const { status, loginWithGoogle, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useLockBodyScroll(open)

  useEffect(() => setOpen(false), [pathname])

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-white/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[4.5rem]">
        <Link
          to="/"
          aria-label="VPEDIA LEARNING home"
          className="rounded-xl transition-opacity hover:opacity-80"
        >
          <Logo size={36} />
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.label}
              to={link.href}
              className={cn(
                'rounded-lg px-3.5 py-2 text-[0.9375rem] font-semibold transition-colors',
                isActive(link.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
              )}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {status === 'authenticated' ? (
            <div className="hidden items-center gap-2 lg:flex">
              <ButtonLink to="/dashboard" size="sm" leadingIcon={<LayoutGrid className="size-4" aria-hidden />}>
                Dashboard
              </ButtonLink>
              <Button variant="ghost" size="sm" onClick={() => void logout()} leadingIcon={<LogOut className="size-4" aria-hidden />}>
                Logout
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              loading={status === 'authenticating'}
              leadingIcon={<GoogleIcon size={16} />}
              onClick={() => void loginWithGoogle()}
            >
              Continue with Google
            </Button>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-hairline bg-white text-ink-700 transition-colors hover:bg-ink-50 lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div
          id="mobile-nav-drawer"
          className="animate-fade-in border-t border-hairline bg-white lg:hidden"
        >
          <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.label}
                to={link.href}
                className={cn(
                  'rounded-xl px-4 py-3 text-base font-semibold transition-colors',
                  isActive(link.href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-700 hover:bg-ink-50',
                )}
              >
                {link.label}
              </NavLink>
            ))}

            <div className="mt-2 border-t border-hairline pt-3">
              {status === 'authenticated' ? (
                <div className="flex flex-col gap-2">
                  <ButtonLink to="/dashboard" size="lg" fullWidth>
                    Go to Dashboard
                  </ButtonLink>
                  <Button variant="outline" size="lg" fullWidth onClick={() => void logout()}>
                    Logout
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  fullWidth
                  loading={status === 'authenticating'}
                  leadingIcon={<GoogleIcon size={18} />}
                  onClick={() => void loginWithGoogle()}
                >
                  Continue with Google
                </Button>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
