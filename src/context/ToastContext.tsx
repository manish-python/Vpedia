import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

/* ========================================================================
   ToastContext
   Lightweight, accessible notifications (polite live region).
   =================================================================== */

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 4200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev.slice(-2), { ...toast, id }])
      const timer = window.setTimeout(() => dismiss(id), DEFAULT_DURATION)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])

  return <ToastContext value={value}>{children}</ToastContext>
}

export function useToast(): ToastContextValue {
  const context = use(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.')
  return context
}
