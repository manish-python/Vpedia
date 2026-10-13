import type { ReactNode } from 'react'

import { AuthProvider } from './AuthContext'
import { PurchaseProvider } from './PurchaseContext'
import { ToastProvider } from './ToastContext'

/* ========================================================================
   Provider composition
   PurchaseProvider sits inside AuthProvider because access depends on who
   is signed in. ToastProvider is outermost so any layer can raise a toast.
   =================================================================== */

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <PurchaseProvider>{children}</PurchaseProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export * from './AuthContext'
export * from './PurchaseContext'
export * from './ToastContext'
