import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { Spinner } from '@/components/common/Spinner'
import { cn } from '@/utils/cn'

/* ========================================================================
   PaymentStatus
   Inline status indicator for the checkout flow. State is conveyed by
   icon and text, never by colour alone.
   =================================================================== */

export type PaymentStatusState = 'idle' | 'processing' | 'success' | 'failed'

const CONFIG: Record<
  PaymentStatusState,
  { icon: typeof CheckCircle2; label: string; tone: string; spin?: boolean }
> = {
  idle: {
    icon: Loader2,
    label: 'Ready to pay',
    tone: 'text-ink-600',
  },
  processing: {
    icon: Loader2,
    label: 'Processing your payment…',
    tone: 'text-brand-700',
    spin: true,
  },
  success: {
    icon: CheckCircle2,
    label: 'Payment successful',
    tone: 'text-leaf-700',
  },
  failed: {
    icon: XCircle,
    label: 'Payment failed',
    tone: 'text-rose-600',
  },
}

export function PaymentStatus({
  state,
  message,
  className,
}: {
  state: PaymentStatusState
  message?: string
  className?: string
}) {
  const config = CONFIG[state]
  const Icon = config.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2.5 rounded-xl bg-ink-50 px-4 py-3 text-sm',
        config.tone,
        className,
      )}
    >
      {state === 'processing' ? (
        <Spinner size={18} className="mt-px" />
      ) : (
        <Icon className="mt-px size-4.5 shrink-0" strokeWidth={2.2} aria-hidden />
      )}
      <span>
        <span className="block font-semibold">{config.label}</span>
        {message ? <span className="mt-0.5 block text-ink-600">{message}</span> : null}
      </span>
    </div>
  )
}
