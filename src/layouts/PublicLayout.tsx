import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Logo } from '@/components/brand/Logo'
import { Navbar } from '@/components/navigation/Navbar'

/* ========================================================================
   Public layout
   Navbar, page content, footer. Used by every route a signed-out visitor
   can reach.
   =================================================================== */

const PRODUCT_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'Classes', to: '/classes' },
  { label: 'FAQs', to: '/faq' },
]

const LEGAL_LINKS = [
  { label: 'Privacy Policy', to: '/faq#privacy' },
  { label: 'Terms & Conditions', to: '/faq#terms' },
  { label: 'Refund Policy', to: '/faq#refund' },
]

const SUPPORT_LINKS = [{ label: 'Contact Us', to: '/faq#support' }]

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#main"
        className="sr-only rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-100"
      >
        Skip to content
      </a>

      <Navbar />

      <main id="main" className="flex-1">
        {children}
      </main>

      <Footer />
    </div>
  )
}

/** Read once at module scope so rendering stays pure. */
const COPYRIGHT_YEAR = new Date().getFullYear()

function Footer() {
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="container-page py-12 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo size={38} />
            <p className="mt-3.5 max-w-xs text-sm leading-relaxed text-ink-500">
              Complete notes, previous year questions, solved solutions and practice papers for
              Classes 7 to 12.
            </p>
          </div>

          <FooterGroup title="Product" links={PRODUCT_LINKS} />
          <FooterGroup title="Legal" links={LEGAL_LINKS} />
          <FooterGroup title="Support" links={SUPPORT_LINKS} />
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-hairline pt-6 sm:flex-row">
          <p className="text-sm text-ink-500">
            © {COPYRIGHT_YEAR} VPEDIA LEARNING. All rights reserved.
          </p>
          <p className="text-xs text-ink-400">
            Made for students who want to study properly.
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterGroup({
  title,
  links,
}: {
  title: string
  links: { label: string; to: string }[]
}) {
  return (
    <nav aria-label={title}>
      <h2 className="text-sm font-bold tracking-wide text-ink-900 uppercase">{title}</h2>
      <ul className="mt-3.5 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-sm text-ink-500 transition-colors hover:text-brand-700"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
