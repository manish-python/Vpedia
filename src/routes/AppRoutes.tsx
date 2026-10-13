import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'

import { AppLayout, PublicLayout } from '@/layouts'
import { Loader } from '@/components/common/Spinner'
import { useScrollToTop } from '@/hooks/useScrollToTop'
import {
  ClassProtectedRoute,
  ClassSelectionRoute,
  ContentProtectedRoute,
  ProtectedRoute,
} from './ProtectedRoute'

/* ========================================================================
   Routes
   ---------------------------------------------------------------------
   Every page except the landing page is code-split. Each route resolves
   its own access guard from the URL, so a guard is never bypassed by
   rendering a page directly.
   =================================================================== */

const HomePage = lazy(() => import('@/pages/Home/HomePage').then((m) => ({ default: m.HomePage })))
const LoginPage = lazy(() => import('@/pages/Login/LoginPage').then((m) => ({ default: m.LoginPage })))
const GoogleCallbackPage = lazy(() =>
  import('@/pages/Login/GoogleCallbackPage').then((m) => ({ default: m.GoogleCallbackPage })),
)
const ClassesPage = lazy(() => import('@/pages/Classes/ClassesPage').then((m) => ({ default: m.ClassesPage })))
const ClassDetailPage = lazy(() => import('@/pages/Classes/ClassDetailPage').then((m) => ({ default: m.ClassDetailPage })))
const SubjectsPage = lazy(() => import('@/pages/Subjects/SubjectsPage').then((m) => ({ default: m.SubjectsPage })))
const ChaptersPage = lazy(() => import('@/pages/Chapters/ChaptersPage').then((m) => ({ default: m.ChaptersPage })))
const ChapterContentPage = lazy(() => import('@/pages/Content/ChapterContentPage').then((m) => ({ default: m.ChapterContentPage })))
const NotesViewerPage = lazy(() => import('@/pages/Content/NotesViewerPage').then((m) => ({ default: m.NotesViewerPage })))
const PyqPage = lazy(() => import('@/pages/Content/PyqPage').then((m) => ({ default: m.PyqPage })))
const PurchasePage = lazy(() => import('@/pages/Purchase/PurchasePage').then((m) => ({ default: m.PurchasePage })))
const PaymentPage = lazy(() => import('@/pages/Payment/PaymentPage').then((m) => ({ default: m.PaymentPage })))
const PaymentSuccessPage = lazy(() => import('@/pages/Payment/PaymentSuccessPage').then((m) => ({ default: m.PaymentSuccessPage })))
const PaymentFailedPage = lazy(() => import('@/pages/Payment/PaymentFailedPage').then((m) => ({ default: m.PaymentFailedPage })))
const DashboardPage = lazy(() => import('@/pages/Dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const MyClassesPage = lazy(() => import('@/pages/Dashboard/MyClassesPage').then((m) => ({ default: m.MyClassesPage })))
const NotificationsPage = lazy(() => import('@/pages/Dashboard/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const LibraryPage = lazy(() => import('@/pages/Library/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const ProfilePage = lazy(() => import('@/pages/Profile/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const SearchPage = lazy(() => import('@/pages/Search/SearchPage').then((m) => ({ default: m.SearchPage })))
const FAQPage = lazy(() => import('@/pages/FAQ/FAQPage').then((m) => ({ default: m.FAQPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFound/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const OtherResourcesPage = lazy(() =>
  import('@/pages/Resources/OtherResourcesPage').then((m) => ({ default: m.OtherResourcesPage })),
)
const OtherResourceDetailPage = lazy(() =>
  import('@/pages/Resources/OtherResourceDetailPage').then((m) => ({ default: m.OtherResourceDetailPage })),
)
const SelectClassPage = lazy(() =>
  import('@/pages/SelectClass/SelectClassPage').then((m) => ({ default: m.SelectClassPage })),
)
const PaymentStatusPage = lazy(() =>
  import('@/pages/Payment/PaymentStatusPage').then((m) => ({ default: m.PaymentStatusPage })),
)
const AdminRoutes = lazy(() =>
  import('@/admin/AdminRoutes').then((m) => ({ default: m.AdminRoutes })),
)

/* ---------------------------------------------------------------------
   Small wrappers that read a route param for the guard
   ------------------------------------------------------------------ */

function ClassRoute({ children }: { children: ReactNode }) {
  const { classId } = useParams<{ classId: string }>()
  return <ClassProtectedRoute classId={Number(classId)}>{children}</ClassProtectedRoute>
}

function SubjectRoute({ children }: { children: ReactNode }) {
  const { subjectId } = useParams<{ subjectId: string }>()
  return <ContentProtectedRoute subjectId={subjectId}>{children}</ContentProtectedRoute>
}

function ChapterRoute({ children }: { children: ReactNode }) {
  const { chapterId } = useParams<{ chapterId: string }>()
  return <ContentProtectedRoute chapterId={chapterId}>{children}</ContentProtectedRoute>
}

function PyqRoute({ children }: { children: ReactNode }) {
  const { subjectId } = useParams<{ subjectId: string }>()
  return <ContentProtectedRoute subjectId={subjectId}>{children}</ContentProtectedRoute>
}

/* ---------------------------------------------------------------------
   Route table
   ------------------------------------------------------------------ */

export function AppRoutes() {
  useScrollToTop()

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/admin-panel/*" element={<AdminRoutes />} />
        {/* ---------- Public ---------- */}
        <Route
          path="/"
          element={
            <PublicLayout>
              <HomePage />
            </PublicLayout>
          }
        />

        <Route path="/login" element={<LoginPage />} />

        {/* ---------- Post-OAuth landing ----------
            Django redirects here after a successful Google sign-in. The page
            confirms the session with the backend before showing anything
            protected, so it is deliberately outside <ProtectedRoute>. */}
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />

        <Route
          path="/classes"
          element={
            <PublicLayout>
              <ClassesPage />
            </PublicLayout>
          }
        />

        <Route
          path="/classes/:classId"
          element={
            <PublicLayout>
              <ClassDetailPage />
            </PublicLayout>
          }
        />

        <Route
          path="/purchase/:classId"
          element={
            <ProtectedRoute>
              <PublicLayout>
                <PurchasePage />
              </PublicLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/faq"
          element={
            <PublicLayout>
              <FAQPage />
            </PublicLayout>
          }
        />

        {/* ---------- Onboarding (own chrome) ----------
            A student with no `selected_class` is sent here first. The page has
            its own header so the choice is unmistakably the next step. */}
        <Route
          path="/select-class"
          element={
            <ProtectedRoute>
              <SelectClassPage />
            </ProtectedRoute>
          }
        />

        {/* ---------- Payment (own chrome) ---------- */}
        <Route
          path="/payment"
          element={
            <ProtectedRoute>
              <PaymentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment/status/:purchaseId"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PaymentStatusPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/payment/success" element={<PaymentSuccessPage />} />
        <Route path="/payment/failed" element={<PaymentFailedPage />} />

        {/* ---------- Student ---------- */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <ClassSelectionRoute>
                <AppLayout>
                  <DashboardPage />
                </AppLayout>
              </ClassSelectionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/classes"
          element={
            <ProtectedRoute>
              <AppLayout>
                <MyClassesPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/notifications"
          element={
            <ProtectedRoute>
              <AppLayout>
                <NotificationsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LibraryPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/search"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SearchPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* ---------- Other Resources ----------
            A second content system. Signed in, but NOT class-purchase gated:
            these resources sit outside the syllabus and outside billing. */}

        <Route
          path="/other-resources"
          element={
            <ProtectedRoute>
              <AppLayout>
                <OtherResourcesPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/other-resources/:slug"
          element={
            <ProtectedRoute>
              <OtherResourceDetailPage />
            </ProtectedRoute>
          }
        />

        {/* ---------- Catalogue: class purchase required ---------- */}
        <Route
          path="/classes/:classId/subjects"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ClassRoute>
                  <SubjectsPage />
                </ClassRoute>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/classes/:classId/subjects/:subjectId"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SubjectRoute>
                  <ChaptersPage />
                </SubjectRoute>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/classes/:classId/subjects/:subjectId/chapters"
          element={
            <ProtectedRoute>
              <AppLayout>
                <SubjectRoute>
                  <ChaptersPage />
                </SubjectRoute>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/chapters/:chapterId/content"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ChapterRoute>
                  <ChapterContentPage />
                </ChapterRoute>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/notes/:contentId"
          element={
            <ProtectedRoute>
              <AppLayout>
                <NotesViewerPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/pyqs/:subjectId"
          element={
            <ProtectedRoute>
              <AppLayout>
                <PyqRoute>
                  <PyqPage />
                </PyqRoute>
              </AppLayout>
            </ProtectedRoute>
          }
        />

        {/* ---------- Fallback ---------- */}
        <Route
          path="*"
          element={
            <PublicLayout>
              <NotFoundPage />
            </PublicLayout>
          }
        />
      </Routes>
    </Suspense>
  )
}

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <Loader label="Loading…" />
    </div>
  )
}
