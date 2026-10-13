/* ========================================================================
   Purchase status card — the one place that renders all five states.

   LOCKED      Locked, price, Buy Now
   INCOMPLETE  Payment not completed, Continue Payment
   PENDING     Payment verification pending, View Payment Status
   ACTIVE      Payment Accepted, Complete Access, Open Class
   REJECTED    Payment Rejected + reason, Submit New Payment Proof

   The state is not decided here. It arrives already resolved from
   `resolveClassPayment`, which weighs every purchase and every proof the
   student holds for this class — because a single purchase record is not enough
   to answer the question once a class has more than one row. See
   `utils/classPaymentState.ts` for the priority and why it is ordered that way.

   Nothing here derives an entitlement and nothing here can grant one: `active`
   exists in this file only because the server said the purchase is ACTIVE.
   =================================================================== */

import { CheckCircle2, Clock, Lock, XCircle, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { VClass } from '@/types'
import type { ClassPaymentState, ClassPaymentView } from '@/utils/classPaymentState'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'

export type { ClassPaymentState } from '@/utils/classPaymentState'

interface Tone {
  card: string
  accent: string
  Icon: LucideIcon
  /** Short status word shown next to the dot. */
  label: string
}

const TONE: Record<ClassPaymentState, Tone> = {
  locked: {
    card: 'border-grape-200 bg-grape-50/60',
    accent: 'text-grape-700',
    Icon: Lock,
    label: 'Locked',
  },
  incomplete: {
    card: 'border-sun-200 bg-sun-50/60',
    accent: 'text-sun-700',
    Icon: Clock,
    label: 'Payment not completed',
  },
  pending: {
    card: 'border-sun-200 bg-sun-50/60',
    accent: 'text-sun-700',
    Icon: Clock,
    label: 'Payment verification pending',
  },
  active: {
    card: 'border-leaf-200 bg-leaf-50/60',
    accent: 'text-leaf-700',
    Icon: CheckCircle2,
    label: 'Payment Accepted · Complete Access',
  },
  rejected: {
    card: 'border-rose-200 bg-rose-50/60',
    accent: 'text-rose-700',
    Icon: XCircle,
    label: 'Payment rejected',
  },
}

const CTA: Record<ClassPaymentState, string> = {
  locked: 'bg-grape-600 hover:bg-grape-700',
  incomplete: 'bg-sun-600 hover:bg-sun-700',
  pending: 'bg-sun-600 hover:bg-sun-700',
  active: 'bg-leaf-600 hover:bg-leaf-700',
  rejected: 'bg-rose-600 hover:bg-rose-700',
}

export function PurchaseStatusCard({
  vClass,
  view,
  className,
}: {
  vClass: VClass
  /** Already resolved by `resolveClassPayment`. This card does not decide. */
  view: ClassPaymentView
  className?: string
}) {
  const { state, purchase, rejectionReason } = view
  const tone = TONE[state]
  const Icon = tone.Icon

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border p-4 shadow-card sm:p-5',
        tone.card,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink-900">{vClass.name}</h3>
          <span
            className={cn(
              'mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-bold shadow-sm',
              tone.accent,
            )}
          >
            <Icon className="size-3" strokeWidth={2.8} aria-hidden />
            {tone.label}
          </span>
        </div>

        <span
          aria-hidden
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm',
            tone.accent,
          )}
        >
          <Icon className="size-5" strokeWidth={2} />
        </span>
      </div>

      <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-600">
        {describe(state, vClass)}
      </p>

      {state === 'rejected' && rejectionReason ? (
        <p className="mt-2.5 rounded-lg bg-white/80 p-2.5 text-xs leading-relaxed text-ink-700">
          <span className="font-bold">Reason: </span>
          {rejectionReason}
        </p>
      ) : null}

      <Link
        to={hrefFor(state, vClass, purchase)}
        className={cn(
          'mt-4 inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-brand transition-colors',
          CTA[state],
        )}
      >
        {ctaLabelFor(state)}
      </Link>
    </article>
  )
}

function describe(state: ClassPaymentState, vClass: VClass): string {
  switch (state) {
    case 'locked':
      return `Complete access at ${formatINR(vClass.price)}`
    case 'incomplete':
      // Reachable only when the server confirmed no proof exists, so this is
      // never a lie about money that is already in review.
      return (
        'You started checkout but did not submit a payment proof. Complete access at ' +
        `${formatINR(vClass.price)} once payment is verified.`
      )
    case 'pending':
      return `Your payment proof for ${formatINR(vClass.price)} has been submitted and is waiting for administrator verification.`
    case 'active':
      return 'All subjects, notes, PYQs and practice papers are available.'
    case 'rejected':
      return `Your payment of ${formatINR(vClass.price)} was not verified. You can submit a fresh proof.`
  }
}

function ctaLabelFor(state: ClassPaymentState): string {
  switch (state) {
    case 'active':
      return 'Open Class'
    case 'pending':
      return 'View Payment Status'
    case 'incomplete':
      return 'Continue Payment'
    case 'rejected':
      return 'Submit New Payment Proof'
    default:
      return 'Buy Now'
  }
}

function hrefFor(
  state: ClassPaymentState,
  vClass: VClass,
  purchase: ClassPaymentView['purchase'],
): string {
  if (state === 'active') return `/classes/${vClass.id}/subjects`
  // Only a real proof is worth a status page. An abandoned checkout goes back
  // to checkout rather than to a page that would say "no proof found".
  if (state === 'pending' && purchase) return `/payment/status/${purchase.id}`
  return `/purchase/${vClass.id}`
}

/**
 * Compact status line for contexts that already have their own layout, such as
 * the purchase summary sidebar. Same states, same wording, so a student sees one
 * consistent vocabulary across the product.
 */
export function PurchaseStatusBadge({
  tone,
  title,
  className,
}: {
  tone: 'sun' | 'rose' | 'leaf' | 'grape'
  title: string
  className?: string
}) {
  const styles = {
    sun: 'border-sun-200 bg-sun-50 text-sun-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    leaf: 'border-leaf-200 bg-leaf-50 text-leaf-700',
    grape: 'border-grape-200 bg-grape-50 text-grape-700',
  } as const

  return (
    <p
      className={cn(
        'rounded-xl border px-3 py-2.5 text-center text-sm font-bold',
        styles[tone],
        className,
      )}
    >
      {title}
    </p>
  )
}
