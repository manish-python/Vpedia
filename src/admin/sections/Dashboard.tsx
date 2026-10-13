/* ========================================================================
   Dashboard V2

   One request, one screen, nothing computed in the browser. Every figure in
   `AdminDashboard` was produced by a grouped SQL query in
   `apps/admin_api/dashboard.py`, so opening this page costs a fixed number of
   queries no matter how much data the platform holds — and a number here can
   never disagree with the same number on the Students or Payments page.
   ===================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, BookOpen, FileText, GraduationCap, IndianRupee, Package, ShoppingBag,
  Sparkles, UserPlus, Users, type LucideIcon,
} from 'lucide-react'

import { adminDashboard } from '@/admin/service'
import { CONTENT_TYPES } from '@/data/contentTypes'
import type { ContentType } from '@/types'
import type { AdminDashboard, AdminNotification } from '@/admin/types'
import { BarList, Donut, StatusBar, TrendChart } from '@/admin/ui/charts'
import {
  Card, CardTitle, ErrorState, PageHeader, StatCard, absoluteTime, money, plural, relativeTime,
} from '@/admin/ui'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<AdminDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    adminDashboard(signal)
      .then(setData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Could not load the dashboard.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="A live overview of VPEDIA LEARNING." />
        <ErrorState message={error} onRetry={() => load()} title="Unable to load the dashboard" />
      </>
    )
  }

  if (loading && !data) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="A live overview of VPEDIA LEARNING." />
        <DashboardSkeleton />
      </>
    )
  }

  if (!data) return null

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="A live overview of VPEDIA LEARNING. Every figure is read from the database."
      />

      {/* ---------- Top statistics ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value={data.students}
          icon={<Users className="size-4" />}
          hint={`+${data.student_growth.month} this month`}
          onClick={() => navigate('/admin-panel/students')}
        />
        <StatCard
          label="Total classes"
          value={data.classes}
          tone="ink"
          icon={<GraduationCap className="size-4" />}
          onClick={() => navigate('/admin-panel/classes')}
        />
        <StatCard
          label="Active purchases"
          value={data.active_purchases}
          tone="emerald"
          icon={<ShoppingBag className="size-4" />}
          hint={`${plural(data.pending_purchases, 'purchase')} pending`}
          onClick={() => navigate('/admin-panel/purchases')}
        />
        <StatCard
          label="Pending payments"
          value={data.pending_payments}
          tone="amber"
          icon={<IndianRupee className="size-4" />}
          hint={`${money(data.payment_status.pending_amount)} awaiting review`}
          onClick={() => navigate('/admin-panel/payments?status=PENDING')}
        />
        <StatCard
          label="Approved revenue"
          value={money(data.approved_revenue)}
          tone="emerald"
          icon={<IndianRupee className="size-4" />}
          hint="Active purchases only"
        />
        <StatCard
          label="Published content"
          value={data.published_content}
          icon={<FileText className="size-4" />}
          hint={`${plural(data.draft_content, 'draft')}`}
          onClick={() => navigate('/admin-panel/content')}
        />
        <StatCard
          label="Other resources"
          value={data.other_resources}
          tone="ink"
          icon={<Package className="size-4" />}
          hint={`${plural(data.resource_stats.active_categories, 'active category', 'active categories')}`}
          onClick={() => navigate('/admin-panel/content')}
        />
        <StatCard
          label="Unread notifications"
          value={data.unread_notifications}
          tone={data.unread_notifications > 0 ? 'amber' : 'ink'}
          icon={<Bell className="size-4" />}
          hint={data.unread_notifications > 0 ? 'Needs a look' : 'All caught up'}
          onClick={() => navigate('/admin-panel/notifications')}
        />
      </div>

      {/* ---------- Trends ---------- */}
      <div className="mt-4 grid gap-4 sm:mt-6 lg:grid-cols-2">
        <Card>
          <CardTitle
            title="Student registrations"
            hint="Last 14 days"
            action={
              <div className="hidden gap-3 sm:flex">
                <MiniStat label="Today" value={data.student_growth.today} />
                <MiniStat label="This week" value={data.student_growth.week} />
                <MiniStat label="This month" value={data.student_growth.month} />
              </div>
            }
          />
          <div className="mb-4 grid grid-cols-3 gap-2 sm:hidden">
            <MiniStat label="Today" value={data.student_growth.today} block />
            <MiniStat label="This week" value={data.student_growth.week} block />
            <MiniStat label="This month" value={data.student_growth.month} block />
          </div>
          <TrendChart data={data.registration_trend} />
        </Card>

        <Card>
          <CardTitle title="Purchases by class" hint="Active purchases, in class order" />
          <BarList
            data={data.purchases_by_class.map((row) => ({ label: row.name, value: row.count }))}
            emptyLabel="No active purchases yet"
          />
        </Card>
      </div>

      {/* ---------- Breakdowns ---------- */}
      <div className="mt-4 grid gap-4 sm:mt-6 lg:grid-cols-3">
        <Card>
          <CardTitle title="Payment status" hint="Submitted proofs" />
          <StatusBar
            total={
              data.payment_status.pending +
              data.payment_status.approved +
              data.payment_status.rejected
            }
            segments={[
              { label: 'Pending', value: data.payment_status.pending, className: 'bg-amber-500' },
              { label: 'Approved', value: data.payment_status.approved, className: 'bg-emerald-500' },
              { label: 'Rejected', value: data.payment_status.rejected, className: 'bg-rose-500' },
            ]}
          />
          <dl className="mt-5 space-y-1 border-t border-hairline pt-4 text-sm">
            <div className="flex justify-between py-1">
              <dt className="text-ink-500">Pending value</dt>
              <dd className="nums font-bold text-ink-900">{money(data.payment_status.pending_amount)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-ink-500">Accepted revenue</dt>
              <dd className="nums font-bold text-emerald-700">{money(data.approved_revenue)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            Revenue counts active purchases only — pending and rejected requests are never included.
          </p>
        </Card>

        <Card>
          <CardTitle title="Content" hint="Class content by type" />
          <BarList
            data={Object.entries(data.content_types).map(([type, count]) => ({
              label: contentTypeLabel(type),
              value: count,
            }))}
            emptyLabel="No content uploaded yet"
          />
          <div className="mt-5 border-t border-hairline pt-4">
            <Donut
              value={data.published_content}
              total={data.published_content + data.draft_content}
              label={plural(data.published_content, 'item')}
              caption={`published · ${data.draft_content} draft`}
            />
          </div>
        </Card>

        <Card>
          <CardTitle title="Other resources" hint="Separate from class content" />
          <div className="grid gap-4">
            <Donut
              value={data.resource_stats.published}
              total={data.resource_stats.total}
              label={plural(data.resource_stats.published, 'resource')}
              caption={`published · ${data.resource_stats.draft} draft`}
            />
            <dl className="space-y-2 border-t border-hairline pt-4 text-sm">
              <Row label="Total resources" value={data.resource_stats.total} />
              <Row label="Published" value={data.resource_stats.published} />
              <Row label="Draft" value={data.resource_stats.draft} />
              <Row label="Active categories" value={data.resource_stats.active_categories} />
            </dl>
          </div>
        </Card>
      </div>

      {/* ---------- Recent activity ---------- */}
      <Card className="mt-4 sm:mt-6">
        <CardTitle
          title="Recent activity"
          hint="The same events the notification bell reports."
          action={
            <button
              type="button"
              onClick={() => navigate('/admin-panel/notifications')}
              className="rounded-lg px-2 py-1 text-sm font-bold text-brand-700 transition hover:bg-brand-50"
            >
              View all
            </button>
          }
        />
        {data.recent_activity.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-400">
            Nothing has happened yet. Registrations, payments and publications will show up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.recent_activity.map((note) => (
              <li key={note.id}>
                <ActivityRow note={note} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <span className="sr-only" role="status">
        {loading ? 'Refreshing dashboard' : 'Dashboard up to date'}
      </span>
    </>
  )
}

/* ---------------------------------------------------------------------
   Pieces
   ------------------------------------------------------------------ */

function MiniStat({ label, value, block }: { label: string; value: number; block?: boolean }) {
  return (
    <div className={block ? 'rounded-xl bg-ink-50 p-2.5 text-center' : 'text-right'}>
      <p className="nums text-lg font-black leading-none text-ink-900">{value}</p>
      <p className="mt-1 text-[0.625rem] font-bold uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="nums font-bold text-ink-900">{value}</dd>
    </div>
  )
}

/** Icon and colour for each activity type, in one lookup. */
const ACTIVITY_STYLE: Record<AdminNotification['type'], { Icon: LucideIcon; tone: string }> = {
  NEW_STUDENT: { Icon: UserPlus, tone: 'bg-brand-50 text-brand-700' },
  CONTENT_PUBLISHED: { Icon: Sparkles, tone: 'bg-brand-50 text-brand-700' },
  RESOURCE_PUBLISHED: { Icon: Package, tone: 'bg-brand-50 text-brand-700' },
  PAYMENT_REQUEST: { Icon: IndianRupee, tone: 'bg-amber-50 text-amber-700' },
  PAYMENT_APPROVED: { Icon: IndianRupee, tone: 'bg-emerald-50 text-emerald-700' },
  PAYMENT_REJECTED: { Icon: IndianRupee, tone: 'bg-rose-50 text-rose-700' },
  SYSTEM_ALERT: { Icon: BookOpen, tone: 'bg-brand-50 text-brand-700' },
}

/** One line of the activity feed. Clicking "Open" jumps to the record. */
function ActivityRow({ note }: { note: AdminNotification }) {
  const navigate = useNavigate()
  const { Icon, tone } = ACTIVITY_STYLE[note.type]

  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-white p-3 transition hover:border-brand-200">
      <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{note.title}</p>
        {note.message ? <p className="mt-0.5 text-sm text-ink-600">{note.message}</p> : null}
        <time
          dateTime={note.created_at}
          title={absoluteTime(note.created_at)}
          className="mt-1 block text-xs font-semibold text-ink-400"
        >
          {relativeTime(note.created_at)}
        </time>
      </div>
      {note.link ? (
        <button
          type="button"
          onClick={() => navigate(note.link)}
          className="hidden shrink-0 self-center rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50 sm:block"
        >
          Open
        </button>
      ) : null}
    </div>
  )
}

/**
 * Label a content type using the product's own vocabulary.
 *
 * Reusing `CONTENT_TYPES` rather than title-casing the enum means the dashboard
 * says "PYQs" and "Important Qs", exactly like the rest of the site, instead of
 * inventing "Pyq" from the wire value.
 */
function contentTypeLabel(value: string): string {
  const known = CONTENT_TYPES[value as ContentType]
  if (known) return known.label
  // A type the frontend has not heard of still needs a readable label.
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-hairline bg-white p-5">
            <div className="h-3 w-24 rounded bg-ink-100" />
            <div className="mt-4 h-8 w-16 rounded bg-ink-100" />
            <div className="mt-3 h-2.5 w-20 rounded bg-ink-100" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="h-64 rounded-2xl border border-hairline bg-white p-5">
            <div className="h-4 w-40 rounded bg-ink-100" />
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="h-3 rounded bg-ink-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}