/* ========================================================================
   Admin routing

   The shell (`AdminApp`) owns the session check, sidebar and header; this
   module only decides which section renders inside it.

   Section selection is a plain lookup on the URL rather than a nested
   `<Routes>`. A descendant `<Routes>` would have to match against the parent's
   remaining pathname, which is an easy thing to get subtly wrong for the index
   route; switching on the segment is unambiguous and keeps every section a
   normal, independently-importable module.

   Django's own admin stays at `/admin/` and is reachable from the sidebar as a
   fallback. The trailing slash on that proxy path in `vite.config.ts` is what
   keeps `/admin-panel` in the SPA.
   ===================================================================== */

import { useLocation } from 'react-router-dom'

import { useToast } from '@/context/ToastContext'
import { AdminApp } from './AdminShell'
import { AdminContentPage } from './ContentManagement'
import { AdminChaptersPage } from './sections/Chapters'
import { AdminDashboardPage } from './sections/Dashboard'
import { AdminNotificationsPage } from './sections/Notifications'
import {
  AdminClassesPage, AdminPaymentsPage, AdminPurchasesPage, AdminStudentsPage, AdminUpiPage,
} from './sections/Panels'
import { AdminSubjectsPage } from './sections/Subjects'

/** `/admin-panel/<section>`, with the index route meaning the dashboard. */
function sectionFromPath(pathname: string): string {
  // '/admin-panel/chapters' -> ['admin-panel', 'chapters']
  const [, , segment] = pathname.split('/')
  return segment || 'dashboard'
}

export function AdminRoutes() {
  const { push } = useToast()
  const location = useLocation()

  return (
    <AdminApp>
      <AdminSection section={sectionFromPath(location.pathname)} onToast={push} />
    </AdminApp>
  )
}

function AdminSection({
  section,
  onToast,
}: {
  section: string
  onToast: (toast: { tone: 'success' | 'error' | 'info'; title: string; description?: string }) => void
}) {
  switch (section) {
    case 'students':
      return <AdminStudentsPage />
    case 'classes':
      return <AdminClassesPage />
    case 'subjects':
      return <AdminSubjectsPage />
    case 'chapters':
      return <AdminChaptersPage />
    case 'content':
      return <AdminContentPage onToast={onToast} />
    case 'payments':
      return <AdminPaymentsPage />
    case 'purchases':
      return <AdminPurchasesPage />
    case 'notifications':
      return <AdminNotificationsPage />
    case 'upi':
      return <AdminUpiPage />
    default:
      // The dashboard is the fallback, so an unknown path lands somewhere
      // useful rather than on a blank screen.
      return <AdminDashboardPage />
  }
}