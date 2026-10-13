import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

import { useToast, type Toast, type ToastTone } from '@/context/ToastContext'
import { cn } from '@/utils/cn'

/* ========================================================================
   Toast viewport
   Rendered once at the app root. Announced politely so it never
   interrupts a screen reader mid-sentence.
   =================================================================== */

const TONE_STYLES: Record<ToastTone, { ring: string; icon: React.ReactNode }> = {
  success: {
    ring: 'border-leaf-200',
    icon: <CheckCircle2 className="size-5 text-leaf-600" aria-hidden />,
  },
  error: {
    ring: 'border-rose-200',
    icon: <AlertCircle className="size-5 text-rose-500" aria-hidden />,
  },
  info: {
    ring: 'border-brand-200',
    icon: <Info className="size-5 text-brand-600" aria-hidden />,
  },
}

export function ToastViewport() {
  const { toasts, dismiss } = useToast()
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-120 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>,
    document.body,
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = TONE_STYLES[toast.tone]
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-pop',
        tone.ring,
      )}
    >
      <span className="mt-0.5 shrink-0">{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
