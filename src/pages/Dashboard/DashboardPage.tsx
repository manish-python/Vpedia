import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Library,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

import { PageHeading } from '@/layouts/AppLayout'
import { ButtonLink } from '@/components/common/Button'
import { ClassTile } from '@/components/cards/ClassCard'
import {
  PurchaseStatusCard,
} from '@/components/purchase/PurchaseStatusCard'
import { DashboardIllustration } from '@/components/illustrations/Illustrations'
import { SkeletonDashboard } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchClasses } from '@/services/classService'
import { usePaymentProofs } from '@/hooks/usePaymentProofs'
import { firstName } from '@/utils/format'
import type { ClassId, VClass } from '@/types'
import type { ClassPaymentView } from '@/utils/classPaymentState'
import { resolveClassPayments } from '@/utils/classPaymentState'

/* ========================================================================
   Student dashboard
   Sidebar and top bar come from AppLayout; this is the main column.

   "Your Classes" is driven by `StudentProfile.selected_class`, never by
   position in the catalogue. It previously took `locked[0]` when nothing was
   unlocked, which handed every brand-new student "Class 7" — a class they had
   never chosen, inside a heading that claims the classes are theirs.
   =================================================================== */

const QUICK_ACTIONS = [
  { label: 'Browse Notes', to: '/search', icon: BookOpen, accent: 'blue' as const },
  { label: 'View PYQs', to: '/search', icon: ClipboardCheck, accent: 'green' as const },
  { label: 'Practice Papers', to: '/search', icon: Sparkles, accent: 'purple' as const },
  { label: 'My Library', to: '/library', icon: Library, accent: 'orange' as const },
]

/** How often the dashboard re-reads purchases while anything is in flight. */
const POLL_MS = 15_000

export function DashboardPage() {
  const { user, isRestoring } = useAuth()
  const { purchases, unlockedClasses, isLoading, refresh } = usePurchase()

  const [dismissed, setDismissed] = useState<string[]>([])

  const { data: classes, isLoading: classesLoading } = useAsync<VClass[]>(
    (signal) => fetchClasses(signal),
    [],
  )

  /**
   * Every payment proof this student has submitted.
   *
   * Paired with the purchases below to answer "what is happening with this
   * class?" for each card. A PENDING purchase on its own proves nothing: the
   * server creates one when the payment page merely opens.
   */
  const { all: proofs } = usePaymentProofs()

  useSeo({
    title: 'Dashboard',
    description: 'Your VPEDIA LEARNING dashboard.',
    path: '/dashboard',
    noIndex: true,
  })

  // `classes ?? []` allocates a new array every render, which would defeat the
  // memo below, so it is stabilised once.
  const all = useMemo(() => classes ?? [], [classes])
  const loading = isLoading || classesLoading || isRestoring

  /**
   * The resolved payment state of every class this student has touched.
   *
   * Deliberately built from *all* purchases and *all* proofs rather than from
   * the newest purchase per class. A class can hold more than one purchase row:
   * `create_purchase_request` only refuses a new one while one is PENDING or
   * ACTIVE, so a rejected purchase is followed by a fresh one. Keying on the
   * newest row made a real, rejected proof invisible whenever a later checkout
   * existed, which is what produced the incorrect "Payment not completed"
   * state.
   */
  const paymentByClass = useMemo(
    () => resolveClassPayments(purchases, proofs),
    [purchases, proofs],
  )

  /** Resolved state for one class. Defaults to Locked, which is never a claim. */
  const viewFor = useCallback(
    (id: ClassId): ClassPaymentView =>
      paymentByClass.get(id) ?? { state: 'locked', purchase: null, proof: null, rejectionReason: null },
    [paymentByClass],
  )

  /**
   * The classes that belong to this student.
   *
   * Two groups, in this order and no others:
   *  - the class they explicitly selected, when there is one
   *  - any class they actually own access to
   *
   * `selected_class` is null until the student chooses one, and that is shown as
   * an onboarding prompt rather than filled in with a guess.
   */
  /**
   * The class this student has *chosen*, as a display name.
   *
   * Read from `user.currentClassId` (the profile's `selected_class`) rather than
   * from `yourClasses`, because that list mixes the selection together with
   * anything the student has actually paid for. Null until they choose - the
   * product never guesses a default class.
   */
  const selectedClassName = useMemo(() => {
    const id = user?.currentClassId ?? null
    if (!id) return null
    return all.find((vClass) => vClass.id === id)?.name ?? null
  }, [all, user?.currentClassId])

  const yourClasses = useMemo(() => {
    const selectedNumber = user?.currentClassId ?? null
    const selected = selectedNumber ? all.find((c) => c.id === selectedNumber) : undefined
    const owned = all.filter((vClass) => unlockedClasses.includes(vClass.id))

    if (!selected) return owned
    return [selected, ...owned.filter((vClass) => vClass.id !== selected.id)]
  }, [all, unlockedClasses, user?.currentClassId])

  /**
   * A purchase that has just been approved while this page was open.
   *
   * Surfaced once, and dismissible. The authoritative view is always the card
   * below, which re-reads from the server on every refresh — this is a
   * courtesy, not a second source of truth.
   */
  const freshAcceptance = useMemo(() => {
    if (dismissed.length) return null
    const accepted = all.filter((vClass) => viewFor(vClass.id).state === 'active')
    const seen = dismissed
    const fresh = accepted.find((vClass) => !seen.includes(String(vClass.id)))
    return fresh ?? null
  }, [all, viewFor, dismissed])

  /**
   * Keep the cards honest while an approval is in flight.
   *
   * An administrator approving a payment changes the server's answer, not this
   * page's. Polling only while something is unresolved, so a settled account
   * makes no background requests at all, and re-reads on focus so a student
   * coming back from another tab sees the change immediately.
   */
  /**
   * Poll only while a decision is outstanding.
   *
   * "Outstanding" means a proof is awaiting review, or a purchase is sitting in
   * an unfinished checkout that the student may still pay. A settled account —
   * active or rejected — makes no background requests at all, so this never
   * polls forever.
   */
  const awaitingDecision = useMemo(
    () =>
      [...paymentByClass.values()].some(
        (view) => view.state === 'pending' || view.state === 'incomplete',
      ),
    [paymentByClass],
  )

  useEffect(() => {
    if (!awaitingDecision) return
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [awaitingDecision, refresh])

  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const onDismiss = useCallback(() => {
    if (freshAcceptance) setDismissed((previous) => [...previous, String(freshAcceptance.id)])
  }, [freshAcceptance])

  return (
    <div className="space-y-7">
      <PageHeading
        title="Dashboard"
        subtitle="Everything you have access to, in one place."
      />

      {/* Payment-accepted banner */}
      {freshAcceptance ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-4 shadow-card"
        >
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-leaf-600 shadow-sm"
          >
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-900">Payment Accepted</p>
            <p className="text-sm text-ink-600">
              Your {freshAcceptance.name} Complete Access is now active.
            </p>
          </div>
          <ButtonLink to={`/classes/${freshAcceptance.id}/subjects`} size="md">
            Open Class
          </ButtonLink>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-600 transition hover:bg-white"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Greeting hero */}
      <section
        aria-label="Greeting"
        className="relative overflow-hidden rounded-2xl bg-mesh p-5 ring-1 ring-brand-100 sm:p-7"
      >
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-bold text-ink-900 sm:text-2xl">
              Hello, {firstName(user?.name)}! <span aria-hidden>👋</span>
            </p>
            <p className="mt-1 text-ink-600">Keep learning, keep growing.</p>

            {/*
              Selected class and purchased class are separate facts, so they get
              separate places. Selecting a class never creates a purchase and
              never grants access, so merging them would tell a student they own
              something they have merely chosen.
            */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-bold text-ink-800 shadow-sm">
                <GraduationCap className="size-3.5 text-brand-600" strokeWidth={2.4} aria-hidden />
                {selectedClassName ? `Studying ${selectedClassName}` : 'No class selected yet'}
              </span>

              <Link
                to="/select-class"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-brand-700 transition-colors hover:bg-white"
              >
                <RefreshCw className="size-3.5" strokeWidth={2.4} aria-hidden />
                Change class
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <ButtonLink
                to={yourClasses.length ? `/classes/${yourClasses[0]!.id}/subjects` : '/classes'}
                size="md"
                trailingIcon={<ArrowRight className="size-4" aria-hidden />}
              >
                {yourClasses.length ? `Explore ${yourClasses[0]!.name}` : 'Browse classes'}
              </ButtonLink>
            </div>
          </div>

          <DashboardIllustration size={190} className="hidden shrink-0 sm:block lg:hidden xl:block" />
        </div>
      </section>

      {/* Your classes */}
      <section aria-labelledby="your-classes">
        <h2 id="your-classes" className="text-lg font-bold text-ink-900 sm:text-xl">
          Your Classes
        </h2>

        <div className="mt-4">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-48 animate-pulse rounded-2xl border border-hairline bg-white" />
              <div className="h-48 animate-pulse rounded-2xl border border-hairline bg-white" />
            </div>
          ) : yourClasses.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {yourClasses.map((vClass) => (
                <PurchaseStatusCard
                  key={vClass.id}
                  vClass={vClass}
                  view={viewFor(vClass.id)}
                />
              ))}
            </div>
          ) : (
            /* No selection and nothing owned. This is the state the old code
               papered over with Class 7. */
            <OnboardingCard />
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="text-lg font-bold text-ink-900 sm:text-xl">
          Quick Actions
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.label}>
              <QuickActionTile {...action} className="h-full" />
            </li>
          ))}
        </ul>
      </section>

      {/* All classes */}
      <section aria-labelledby="all-classes">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="all-classes" className="text-lg font-bold text-ink-900 sm:text-xl">
            All Classes
          </h2>
          {/* min-h-11 keeps this above the 44px comfortable target for the
              same reason every other control here has one: it is a tap target,
              not just a caption. */}
          <Link
            to="/classes"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
          >
            See pricing
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {all.map((vClass) => (
            <li key={vClass.id}>
              <ClassTile vClass={vClass} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Onboarding — shown when the student has chosen no class and owns none.

   Deliberately names no class. Offering "Class 7" here is what caused the
   original report: an empty selection rendered as if a class had been chosen.
   ------------------------------------------------------------------ */
function OnboardingCard() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-white p-6 text-center shadow-card sm:p-8">
      <span
        aria-hidden
        className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
      >
        <GraduationCap className="size-7" />
      </span>
      <h3 className="text-lg font-bold text-ink-900">Choose your class to get started</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">
        You have not chosen a class yet. Pick one and we will shape your dashboard
        around it.
      </p>
      <ButtonLink to="/select-class" size="lg" className="mt-5" fullWidth>
        Choose Class
      </ButtonLink>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Quick actions — inline so this page does not depend on a second card set.
   Kept visually identical to the shared QuickActionCard.
   ------------------------------------------------------------------ */
const ACCENT: Record<string, string> = {
  blue: 'bg-brand-50 text-brand-600',
  green: 'bg-leaf-50 text-leaf-600',
  purple: 'bg-grape-50 text-grape-600',
  orange: 'bg-sun-50 text-sun-600',
}

function QuickActionTile({
  label,
  to,
  icon: Icon,
  accent,
  className,
}: {
  label: string
  to: string
  icon: typeof BookOpen
  accent: keyof typeof ACCENT
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`flex h-full flex-col items-start gap-2 rounded-2xl border border-hairline bg-white p-4 shadow-card transition hover:border-brand-300 hover:shadow-card-hover ${className ?? ''}`}
    >
      <span
        aria-hidden
        className={`flex size-10 items-center justify-center rounded-xl ${ACCENT[accent] ?? ACCENT.blue}`}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <span className="text-sm font-bold text-ink-900">{label}</span>
    </Link>
  )
}

/* ---------------------------------------------------------------------
   Dashboard skeleton, exported for reuse in route fallbacks
   ------------------------------------------------------------------ */
export { SkeletonDashboard }