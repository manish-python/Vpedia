import { NavLink } from 'react-router-dom'
import {
  Bell,
  CircleHelp,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  User,
  type LucideIcon,
} from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/utils/cn'

/* ========================================================================
   Student desktop sidebar
   Primary destinations at the top, support and logout pinned to the bottom.
   ===================================================================== */

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const PRIMARY: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/classes', label: 'My Classes', icon: GraduationCap },
  { to: '/library', label: 'My Library', icon: Library },
  // Second content system: independent of the class syllabus and of any purchase.
  { to: '/other-resources', label: 'Other Resources', icon: FileText },
  { to: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
]

const SECONDARY: NavItem[] = [{ to: '/faq', label: 'Help & Support', icon: CircleHelp }]

export function Sidebar({ className }: { className?: string }) {
  const { logout } = useAuth()

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] font-semibold transition-colors',
            isActive
              ? 'bg-brand-50 text-brand-700'
              : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
          )
        }
      >
        <Icon className="size-5 shrink-0" strokeWidth={2} aria-hidden />
        {item.label}
      </NavLink>
    )
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-white lg:flex',
        className,
      )}
    >
      <div className="flex h-[4.5rem] items-center px-5">
        <NavLink to="/dashboard" aria-label="VPEDIA LEARNING dashboard">
          <Logo size={34} />
        </NavLink>
      </div>

      <nav aria-label="Student" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {PRIMARY.map(renderItem)}
      </nav>

      <div className="space-y-1 border-t border-hairline px-3 py-3">
        {SECONDARY.map(renderItem)}
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] font-semibold text-ink-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut className="size-5 shrink-0" strokeWidth={2} aria-hidden />
          Logout
        </button>
      </div>
    </aside>
  )
}
