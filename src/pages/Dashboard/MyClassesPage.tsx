import { PageHeading } from '@/layouts/AppLayout'
import { ClassTile } from '@/components/cards/ClassCard'
import { LockedCard, UnlockedCard } from '@/components/cards/FeatureCard'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonPanel } from '@/components/common/Skeleton'
import { ButtonLink } from '@/components/common/Button'
import { useAsync, useSeo } from '@/hooks'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchClasses } from '@/services/classService'
import { formatINR } from '@/utils/format'
import type { VClass } from '@/types'

/* ========================================================================
   My Classes
   The full class list from the student's point of view: what is unlocked
   and what still needs a purchase.
   =================================================================== */

export function MyClassesPage() {
  const { unlockedClasses, isLoading } = usePurchase()

  const { data: classes, isLoading: classesLoading } = useAsync<VClass[]>(
    (signal) => fetchClasses(signal),
    [],
  )

  useSeo({
    title: 'My Classes',
    description: 'Your purchased and available classes.',
    path: '/dashboard/classes',
    noIndex: true,
  })

  const all = classes ?? []
  const unlocked = all.filter((vClass) => unlockedClasses.includes(vClass.id))
  const locked = all.filter((vClass) => !unlockedClasses.includes(vClass.id))
  const loading = isLoading || classesLoading

  return (
    <div className="space-y-7">
      <PageHeading
        title="My Classes"
        subtitle="One payment gives complete access to that class only."
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonPanel className="h-48" />
          <SkeletonPanel className="h-48" />
        </div>
      ) : unlocked.length === 0 && locked.length === 0 ? (
        <EmptyState
          title="No classes yet"
          description="Purchase a class to start building your study library."
          action={{ label: 'Explore Classes', to: '/classes' }}
        />
      ) : (
        <>
          {unlocked.length > 0 ? (
            <section aria-labelledby="unlocked-heading">
              <h2 id="unlocked-heading" className="text-lg font-bold text-ink-900">
                Unlocked
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {unlocked.map((vClass) => (
                  <li key={vClass.id}>
                    <UnlockedCard
                      title={vClass.name}
                      description="All subjects, notes, PYQs and more"
                      ctaLabel={`Explore ${vClass.name} →`}
                      ctaTo={`/classes/${vClass.id}/subjects`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {locked.length > 0 ? (
            <section aria-labelledby="locked-heading">
              <h2 id="locked-heading" className="text-lg font-bold text-ink-900">
                Available to unlock
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {locked.map((vClass) => (
                  <li key={vClass.id}>
                    <LockedCard
                      title={vClass.name}
                      priceLabel={formatINR(vClass.price)}
                      ctaTo={`/classes/${vClass.id}`}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="browse-heading">
            <h2 id="browse-heading" className="text-lg font-bold text-ink-900">
              Browse all
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {all.map((vClass) => (
                <li key={vClass.id}>
                  <ClassTile vClass={vClass} />
                </li>
              ))}
            </ul>
          </section>

          {unlocked.length === 0 ? (
            <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-6 text-center">
              <p className="text-sm text-ink-600">
                Nothing unlocked yet. Purchasing a class gives you every subject in it.
              </p>
              <div className="mt-4 flex justify-center">
                <ButtonLink to="/classes" size="md">
                  Explore Classes
                </ButtonLink>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
