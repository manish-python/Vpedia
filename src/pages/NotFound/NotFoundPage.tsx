import { Link } from 'react-router-dom'
import { Home, Search } from 'lucide-react'

import { ButtonLink } from '@/components/common/Button'
import { NotFoundIllustration } from '@/components/illustrations/Illustrations'
import { useSeo } from '@/hooks'

/* ========================================================================
   404
   =================================================================== */

export function NotFoundPage() {
  useSeo({
    title: 'Page Not Found',
    description: 'The page you were looking for does not exist.',
    noIndex: true,
  })

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <NotFoundIllustration size={230} className="mx-auto w-full max-w-sm animate-fade-in" />

        <p
          aria-hidden
          className="mt-6 text-6xl font-extrabold tracking-tight text-brand-100 sm:text-7xl"
        >
          404
        </p>

        <h1 className="mt-1 text-2xl sm:text-3xl">Page Not Found</h1>

        <p className="mx-auto mt-3 max-w-sm text-ink-600">
          We couldn&apos;t find the page you were looking for. It may have moved, or the link may
          be incomplete.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <ButtonLink
            to="/"
            size="lg"
            className="sm:min-w-44"
            leadingIcon={<Home className="size-5" aria-hidden />}
          >
            Go Home
          </ButtonLink>
          <ButtonLink
            to="/search"
            variant="outline"
            size="lg"
            className="sm:min-w-44"
            leadingIcon={<Search className="size-5" aria-hidden />}
          >
            Search
          </ButtonLink>
        </div>

        <p className="mt-8 text-sm text-ink-500">
          Looking for a class?{' '}
          <Link to="/classes" className="font-semibold text-brand-700 underline">
            Browse Classes 7–12
          </Link>
        </p>
      </div>
    </div>
  )
}
