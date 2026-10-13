import { BrowserRouter } from 'react-router-dom'

import { ToastViewport } from '@/components/common/Toast'
import { AppProviders } from '@/context/AppProviders'
import { AppRoutes } from '@/routes/AppRoutes'

/* ========================================================================
   VPEDIA LEARNING — application root
   =================================================================== */

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
        <ToastViewport />
      </AppProviders>
    </BrowserRouter>
  )
}
