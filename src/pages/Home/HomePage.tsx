import { Link } from 'react-router-dom'
import {
  ArrowRight,
  FileCheck2,
  IndianRupee,
  Layers,
  ShieldCheck,
} from 'lucide-react'

import { Button, ButtonLink, GoogleIcon } from '@/components/common'
import { SkeletonClassGrid } from '@/components/common/Skeleton'
import { FeatureCard } from '@/components/cards/FeatureCard'
import { ClassTile } from '@/components/cards/ClassCard'
import { HeroVisual } from '@/components/illustrations/HeroVisual'
import { Section, SectionHeading } from '@/components/common/Card'
import { useAuth } from '@/context/AuthContext'
import { useCatalogue } from '@/hooks/useCatalog'
import { DEEP_FEATURES, HERO_FEATURES, TRUST_ITEMS } from '@/data/marketing'
import { formatINR } from '@/utils/format'

/* ========================================================================
   Landing page
   Composition follows the reference: badge, headline with a single
   highlighted word, support copy, dual CTA, illustration with floating
   material chips, a five-card feature strip, the class grid, the trust
   row, and a closing CTA.
   =================================================================== */

export function HomePage() {
  return (
    <>
      <HeroSection />
      <FeatureStrip />
      <DeepFeatures />
      <ClassPicker />
      <PricingSection />
      <TrustRow />
      <ClosingCta />
    </>
  )
}

/* ---------------------------------------------------------------------
   Hero
   ------------------------------------------------------------------ */

function HeroSection() {
  const { status, loginWithGoogle } = useAuth()

  return (
    <section className="bg-mesh">
      <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:py-20">
        {/* Copy */}
        <div className="animate-fade-up text-center lg:text-left">
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 rounded-full border border-brand-200 bg-white px-3.5 py-1.5 text-[0.625rem] font-bold uppercase leading-relaxed tracking-[0.06em] text-brand-700 shadow-sm sm:text-[0.8125rem] sm:tracking-[0.08em]">
            Learning Resources for Classes 7–12
          </span>

          <h1 className="mt-5 text-[2.125rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.375rem]">
            Learn Smarter.
            <br />
            Prepare Better. <span className="text-brand-gradient">Achieve More.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink-600 sm:text-lg lg:mx-0">
            Your class-wise notes, previous year questions, solved solutions and practice papers
            — all in one place.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:justify-start">
            <ButtonLink
              to="/classes"
              size="lg"
              trailingIcon={<ArrowRight className="size-5" aria-hidden />}
              className="sm:min-w-52"
            >
              Explore Classes
            </ButtonLink>

            <Button
              variant="outline"
              size="lg"
              className="sm:min-w-56"
              loading={status === 'authenticating'}
              leadingIcon={<GoogleIcon size={18} />}
              onClick={() => void loginWithGoogle()}
            >
              Continue with Google
            </Button>
          </div>

          {/* The one-time model, stated before anyone reaches the price list. */}
          <p className="mt-5 text-xs leading-relaxed text-ink-500 sm:text-sm">
            One payment per class. No subscription, no renewal.
          </p>
        </div>

        {/* Study-material composition: the six real content types, not a figure */}
        <div className="relative flex justify-center lg:justify-end">
          <HeroVisual className="w-full max-w-lg animate-fade-in lg:max-w-none" />
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------
   Five-card feature strip
   ------------------------------------------------------------------ */

function FeatureStrip() {
  return (
    <section aria-label="What you get" className="container-page -mt-2 pb-4 sm:pb-8">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {HERO_FEATURES.map((feature) => (
          <li key={feature.title}>
            <FeatureCard {...feature} className="h-full p-4 sm:p-5" />
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------------------------------------------------------------------
   "Everything You Need to Learn Better"
   ------------------------------------------------------------------ */

function DeepFeatures() {
  return (
    <Section tone="white" id="features">
      <div className="container-page">
        <SectionHeading
          eyebrow="Study Material"
          title="Everything You Need to Learn Better"
          subtitle="Six kinds of material, one purchase, every chapter of your class."
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEEP_FEATURES.map((feature) => (
            <li key={feature.title}>
              <FeatureCard {...feature} className="h-full text-left" />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------------
   Class picker
   ------------------------------------------------------------------ */

function ClassPicker() {
  // Classes come from the API, shared session-wide with the rest of the app.
  const { classes, isLoading, error } = useCatalogue()

  return (
    <Section tone="canvas">
      <div className="container-page">
        <SectionHeading
          eyebrow="Classes 7 – 12"
          title="Choose Your Class"
          subtitle="Select your class to explore study material"
        />

        {isLoading ? (
          <div className="mt-9">
            <SkeletonClassGrid count={6} />
          </div>
        ) : error ? (
          <p className="mt-9 text-center text-sm text-ink-500">{error}</p>
        ) : (
          <ul className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {classes.map((vClass) => (
              <li key={vClass.id}>
                <ClassTile vClass={vClass} />
              </li>
            ))}
          </ul>
        )}

        <div className="mt-9 flex justify-center">
          <ButtonLink
            to="/classes"
            variant="outline"
            size="lg"
            trailingIcon={<ArrowRight className="size-5" aria-hidden />}
          >
            View all classes and pricing
          </ButtonLink>
        </div>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------------
   Pricing — the real one-time UPI model
   ------------------------------------------------------------------ */

/** The four steps, in the order the backend actually performs them. */
const PAYMENT_STEPS = [
  {
    icon: Layers,
    title: 'Choose your class',
    body: 'Pick one class. Each class is a separate one-time purchase.',
  },
  {
    icon: IndianRupee,
    title: 'Pay once over UPI',
    body: 'Use any UPI app to pay the exact amount shown for that class.',
  },
  {
    icon: FileCheck2,
    title: 'Submit payment proof',
    body: 'Attach a screenshot and your UTR so the transfer can be matched.',
  },
  {
    icon: ShieldCheck,
    title: 'Admin approval',
    body: 'An administrator verifies it, then your access is activated.',
  },
] as const

function PricingSection() {
  // Same catalogue the tiles use, so prices can never disagree between the two.
  const { classes, isLoading, error } = useCatalogue()

  const priced = classes.filter((vClass) => typeof vClass.price === 'number' && vClass.price > 0)
  const lowest = priced.length
    ? Math.min(...priced.map((vClass) => vClass.price as number))
    : null
  const highest = priced.length
    ? Math.max(...priced.map((vClass) => vClass.price as number))
    : null

  return (
    <Section tone="mesh" id="pricing">
      <div className="container-page">
        <SectionHeading
          eyebrow="Pricing"
          title="One payment. Complete access."
          subtitle="No subscription, no renewal, no hidden charges. Payment is collected over UPI and verified by our team before access opens."
        />

        {/* How it works */}
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PAYMENT_STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="surface-card h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <step.icon className="size-5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-xs font-extrabold text-ink-300 nums">{index + 1}</span>
                </div>
                <h3 className="mt-3.5 text-base">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Real prices from the API */}
        <div className="mt-10 rounded-2xl border border-hairline bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl">Class prices</h3>
              <p className="mt-1.5 text-sm text-ink-600">
                Prices are set per class and shown exactly as the server publishes them.
              </p>
            </div>

            {!isLoading && !error && lowest !== null && highest !== null ? (
              <p className="text-sm text-ink-600">
                {lowest === highest ? (
                  <>One-time access: <strong className="nums text-ink-900">{formatINR(lowest)}</strong></>
                ) : (
                  <>
                    One-time access from{' '}
                    <strong className="nums text-ink-900">{formatINR(lowest)}</strong>
                  </>
                )}
              </p>
            ) : null}
          </div>

          {isLoading ? (
            <SkeletonClassGrid count={6} />
          ) : error ? (
            <p className="mt-6 text-sm text-ink-500">{error}</p>
          ) : priced.length === 0 ? (
            <p className="mt-6 text-sm text-ink-500">
              Prices are not published yet. Browse the classes page for the latest.
            </p>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {classes.map((vClass) => (
                <li key={vClass.id}>
                  <Link
                    to={`/classes/${vClass.id}`}
                    className="group flex flex-col items-center gap-1 rounded-xl border border-hairline bg-canvas px-3 py-3.5 text-center transition-colors hover:border-brand-200 hover:bg-brand-50/60"
                  >
                    <span className="text-xs font-bold text-ink-500">{vClass.name}</span>
                    <span className="nums text-base font-extrabold text-ink-900">
                      {typeof vClass.price === 'number' && vClass.price > 0
                        ? formatINR(vClass.price)
                        : '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-ink-500">
              Payment is collected outside this website over UPI. Access is granted only after an
              administrator verifies your transfer.
            </p>
            <ButtonLink
              to="/classes"
              variant="outline"
              size="md"
              className="shrink-0"
              trailingIcon={<ArrowRight className="size-4" aria-hidden />}
            >
              See all classes
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------------
   Trust row
   ------------------------------------------------------------------ */

function TrustRow() {
  return (
    <Section tone="white" padding="md">
      <div className="container-page">
        {/* Factual benefits only. There is no analytics in this codebase that
            could support a student count or a results claim, so neither is
            asserted here. */}
        <h2 className="text-center text-lg font-bold text-ink-900 sm:text-xl">
          Built for focused, exam-ready revision
        </h2>

        <ul className="mt-7 grid gap-5 sm:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <li key={item.title} className="flex justify-center">
              <FeatureRowContent {...item} />
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

function FeatureRowContent({
  icon: Icon,
  title,
  description,
  accent = 'green',
}: (typeof TRUST_ITEMS)[number]) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          accent === 'green'
            ? 'bg-leaf-50 text-leaf-600'
            : accent === 'sky'
              ? 'bg-sky-brand-50 text-sky-brand-600'
              : 'bg-sun-50 text-sun-600'
        }`}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <span>
        <span className="block text-sm font-bold text-ink-900">{title}</span>
        <span className="block text-xs text-ink-500">{description}</span>
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Closing CTA
   ------------------------------------------------------------------ */

function ClosingCta() {
  return (
    <Section tone="mesh" padding="md">
      <div className="container-page text-center">
        <h2 className="mx-auto max-w-2xl text-2xl sm:text-3xl lg:text-4xl">
          Start Your Learning Journey Today
        </h2>
        <p className="mx-auto mt-3.5 max-w-xl text-ink-600">
          Pick your class, pay once, and get every note, paper and solution you need.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink
            to="/classes"
            size="lg"
            trailingIcon={<ArrowRight className="size-5" aria-hidden />}
          >
            Explore Classes
          </ButtonLink>
          <Link
            to="/faq"
            className="inline-flex h-12 items-center justify-center rounded-xl px-5 text-base font-semibold text-brand-700 transition-colors hover:bg-white"
          >
            Read FAQs
          </Link>
        </div>
      </div>
    </Section>
  )
}
