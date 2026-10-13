import { NavLink } from 'react-router-dom'
import {
  FileText,
  GraduationCap,
  Home,
  Library,
  User,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/utils/cn'

/* ========================================================================
   Authenticated mobile navigation
   Home · Classes · Library · Resources · Profile.
   The active destination is marked with colour, weight and an underline,
   so state is never conveyed by colour alone.
   ===================================================================== */

interface Item {
  to: string
  label: string
  icon: LucideIcon
}

const ITEMS: Item[] = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/dashboard/classes', label: 'Classes', icon: GraduationCap },
  { to: '/library', label: 'Library', icon: Library },
  // Other Resources replaces the Search tab here so the bar keeps five
  // comfortably tappable items; search still lives in the top bar and /search.
  { to: '/other-resources', label: 'Resources', icon: FileText },
  { to: '/profile', label: 'Profile', icon: User },
]

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <li key={item.to} className="min-w-0 flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5',
                    'text-[0.6875rem] font-semibold transition-colors',
                    isActive ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className="size-5 shrink-0"
                      strokeWidth={isActive ? 2.4 : 2}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-600 transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
