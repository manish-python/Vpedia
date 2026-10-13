import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { ButtonLink } from '@/components/common/Button'
import { Section, SectionHeading } from '@/components/common/Card'
import { SkeletonClassGrid } from '@/components/common/Skeleton'
import { PricingCard } from '@/components/cards/ClassCard'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { fetchClasses } from '@/services/classService'
import type { StreamId, VClass } from '@/types'

/* ========================================================================
   Class selection
   The main public entry point into a purchase. Prices come from structured
   data and are placeholders until the backend is authoritative.
   =================================================================== */

export function ClassesPage() {
  useSeo({
    title: 'Classes and Pricing',
    description:
      'Choose your class from 7 to 12 and get complete access to notes, PYQs, solved solutions, important questions, practice and model papers. One-time payment.',
    path: '/classes',
  })

  const { data: classes, isLoading } = useAsync<VClass[]>((signal) => fetchClasses(signal), [])
  const { isUnlocked } = usePurchase()
  const { status } = useAuth()

  return (
    <Section tone="canvas" padding="md">
      <div className="container-page">
        <SectionHeading
          as="h1"
          eyebrow="One payment · Complete access"
          title="Select Your Class"
          subtitle="Choose your class to see available study material and pricing."
          align="left"
        />

        <div id="pricing" className="mt-10 scroll-mt-24">
          {isLoading || !classes ? (
            <SkeletonClassGrid count={6} />
          ) : (
            /* Extra top padding so the "Most Popular" badge never collides
               with the row above. */
            <ul className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((vClass) => (
                <li key={vClass.id}>
                  <PricingCard vClass={vClass} className="h-full" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* How access works */}
        <section aria-labelledby="access-model" className="mt-14">
          <h2 id="access-model" className="text-xl sm:text-2xl">
            How access works
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'One class, one payment',
                body: 'Paying for a class unlocks every subject and chapter inside it.',
              },
              {
                title: 'Nothing else unlocks',
                body: 'A Class 10 purchase never gives you Class 7, 8, 9, 11 or 12.',
              },
              {
                title: 'One time only',
                body: 'No subscription, no renewal. Your library stays in your account.',
              },
            ].map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-hairline bg-white p-5 shadow-card"
              >
                <h3 className="text-[0.9375rem] font-bold text-ink-900">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Stream selection for 11 / 12 */}
        <StreamPicker />

        {/* Already-unlocked nudge */}
        {status === 'authenticated' ? (
          <UnlockedNotice classes={classes ?? []} isUnlocked={isUnlocked} />
        ) : (
          <SignInNudge />
        )}
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------------
   Stream picker
   ------------------------------------------------------------------ */

function StreamPicker() {
  const streams: { id: StreamId; name: string; subjects: string[] }[] = [
    {
      id: 'science',
      name: 'Science',
      subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'],
    },
    {
      id: 'commerce',
      name: 'Commerce',
      subjects: ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English'],
    },
    {
      id: 'humanities',
      name: 'Humanities',
      subjects: ['History', 'Political Science', 'Geography', 'Economics', 'English'],
    },
  ]

  return (
    <section aria-labelledby="stream-heading" className="mt-14">
      <h2 id="stream-heading" className="text-xl sm:text-2xl">
        Choosing a Stream? <span className="font-semibold text-ink-500">(Class 11 &amp; 12)</span>
      </h2>
      <p className="mt-1.5 text-ink-500">
        Class 11 and 12 unlock the subjects for your chosen stream.
      </p>

      <ul className="mt-5 grid gap-4 lg:grid-cols-3">
        {streams.map((stream) => (
          <li
            key={stream.id}
            className="rounded-2xl border border-hairline bg-white p-5 shadow-card"
          >
            <h3 className="text-[0.9375rem] font-bold text-ink-900">{stream.name}</h3>
            <ul className="mt-3 space-y-1.5">
              {stream.subjects.map((subject) => (
                <li key={subject} className="flex items-center gap-2 text-sm text-ink-600">
                  <span aria-hidden className="size-1.5 rounded-full bg-brand-400" />
                  {subject}
                </li>
              ))}
            </ul>
            <Link
              to="/classes/11"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
            >
              View Class 11 {stream.name}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------------------------------------------------------------------
   Contextual nudges
   ------------------------------------------------------------------ */

function UnlockedNotice({
  classes,
  isUnlocked,
}: {
  classes: VClass[]
  isUnlocked: (id: VClass['id']) => boolean
}) {
  const owned = classes.filter((vClass) => isUnlocked(vClass.id))
  if (owned.length === 0) return null

  return (
    <section className="mt-14 rounded-2xl border border-leaf-200 bg-leaf-50/60 p-6">
      <h2 className="text-lg font-bold text-ink-900">You already have access</h2>
      <p className="mt-1 text-sm text-ink-600">
        Jump straight back into the material you purchased.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2.5">
        {owned.map((vClass) => (
          <li key={vClass.id}>
            <ButtonLink
              to={`/classes/${vClass.id}/subjects`}
              size="sm"
              trailingIcon={<ArrowRight className="size-4" aria-hidden />}
            >
              Explore {vClass.name}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SignInNudge() {
  return (
    <section className="mt-14 rounded-2xl border border-brand-200 bg-brand-50/60 p-6">
      <h2 className="text-lg font-bold text-ink-900">Already studying with us?</h2>
      <p className="mt-1 text-sm text-ink-600">
        Sign in with Google to see your purchased classes and continue where you left off.
      </p>
      <div className="mt-4">
        <ButtonLink to="/login" size="md">
          Sign in
        </ButtonLink>
      </div>
    </section>
  )
}
