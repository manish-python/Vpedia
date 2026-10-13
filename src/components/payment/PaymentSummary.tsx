import { ShieldCheck } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Stream, VClass } from '@/types'

/* ========================================================================
   PaymentSummary
   Shown identically on the purchase page and inside the checkout sheet, so
   the amount a student confirms is never ambiguous.
   =================================================================== */

export function PaymentSummary({
  vClass,
  stream,
  className,
  compact = false,
}: {
  vClass: VClass
  stream?: Stream | null
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-hairline bg-white shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-brand-50/50 px-5 py-3">
        <Logo size={30} variant="inline" />
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-700 shadow-sm">
          Complete Access
        </span>
      </div>

      <div className={cn('px-5', compact ? 'py-4' : 'py-5')}>
        <p className="text-sm font-medium text-ink-500">You are purchasing</p>
        <p className="mt-0.5 text-xl font-bold text-ink-900">
          {vClass.name}
          {stream ? (
            <span className="ml-2 text-base font-semibold text-grape-600">{stream.name}</span>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-ink-500">{vClass.name} Complete Access</p>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-hairline pt-4">
          <span className="text-sm font-semibold text-ink-600">Total</span>
          <span className="text-2xl font-extrabold text-sun-600 nums">{formatINR(vClass.price)}</span>
        </div>

        <p className="mt-1 text-right text-xs font-medium text-ink-500">
          One-time payment · no renewal
        </p>
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-hairline bg-ink-50 px-5 py-2.5 text-xs font-semibold text-ink-500">
        <ShieldCheck className="size-4 text-leaf-600" aria-hidden />
        Verified by an administrator
      </div>
    </div>
  )
}
