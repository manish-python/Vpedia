import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Lock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Breadcrumb } from '@/components/navigation/Breadcrumb'
import { Badge, PopularBadge } from '@/components/common/Badge'
import { Button, ButtonLink } from '@/components/common/Button'
import { Checklist } from '@/components/cards/FeatureCard'
import { ClassArtwork } from '@/components/illustrations/ClassArtwork'
import { SkeletonPanel } from '@/components/common/Skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { useToast } from '@/context/ToastContext'
import { formatINR } from '@/utils/format'
import { CLASS_NUMBERS } from '@/data/presentation'
import { fetchStreams } from '@/services/classService'
import { resolveClass } from '@/services/resolveService'
import type { ClassId, Stream, StreamId } from '@/types'

/* ========================================================================
   Class details
   Everything included in the purchase, the one-time price, and the
   stream choice for Class 11 / 12. No payment logic lives here.

   The name, description and price all come from `GET /classes/{slug}/`.
   Nothing here is a local fixture.
   =================================================================== */

export function ClassDetailPage() {
  const params = useParams<{ classId: string }>()
  const navigate = useNavigate()
  const classId = Number(params.classId)

  const { isUnlocked } = usePurchase()
  const { status } = useAuth()
  const { push } = useToast()

  const plausible = CLASS_NUMBERS.includes(classId as ClassId)
  const { data: vClass, isLoading } = useAsync(
    (signal) => (plausible ? resolveClass(classId as ClassId, signal) : Promise.resolve(null)),
    [classId],
    { enabled: plausible },
  )

  const [stream, setStream] = useState<StreamId | null>(null)

  useSeo({
    title: vClass ? `${vClass.name} Complete Access` : 'Class details',
    description:
      vClass?.description ??
      'Complete access to notes, PYQs, solved solutions, practice and model papers.',
    path: `/classes/${classId}`,
  })

  if (!plausible) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Class not found"
          description="This class is not available."
          action={{ label: 'Choose a class', to: '/classes' }}
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container-page space-y-5 py-10">
        <SkeletonPanel className="h-9 w-64" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <SkeletonPanel className="h-96" />
          <SkeletonPanel className="h-72" />
        </div>
      </div>
    )
  }

  // A class that resolved to nothing is genuinely absent from the catalogue.
  if (!vClass) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Class not found"
          description="This class is not available right now."
          action={{ label: 'Choose a class', to: '/classes' }}
        />
      </div>
    )
  }

  const unlocked = isUnlocked(vClass.id)
  const needsStream = vClass.hasStreams && !stream

  const proceed = () => {
    if (status !== 'authenticated') {
      push({
        tone: 'info',
        title: 'Sign in to continue',
        description: 'Use your Google account to finish the purchase.',
      })
      navigate('/login', { state: { from: `/classes/${vClass.id}` } })
      return
    }
    navigate(`/purchase/${vClass.id}`, {
      state: stream ? { streamId: stream } : undefined,
    })
  }

  return (
    <div className="pb-16">
      <div className="border-b border-hairline bg-white">
        <div className="container-page py-6">
          <Breadcrumb
            items={[
              { label: 'Home', to: '/' },
              { label: 'Classes', to: '/classes' },
              { label: vClass.name },
            ]}
          />
        </div>
      </div>

      <div className="container-page grid gap-8 py-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-12 lg:py-12">
        {/* Main column */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 sm:size-16"
            >
              <ClassArtwork classId={vClass.id} size={vClass.id === 10 ? 56 : 52} />
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-4xl">{vClass.name}</h1>
              <p className="mt-0.5 text-sm text-ink-500">{vClass.tagline}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Badge tone="brand" icon={<Check className="size-3.5" strokeWidth={3} aria-hidden />}>
              Complete Access
            </Badge>
            {vClass.isPopular ? <PopularBadge /> : null}
            {unlocked ? (
              <Badge tone="leaf" icon={<Check className="size-3.5" strokeWidth={3} aria-hidden />}>
                Already purchased
              </Badge>
            ) : (
              <Badge tone="neutral" icon={<Lock className="size-3" strokeWidth={2.5} aria-hidden />}>
                One-time payment
              </Badge>
            )}
          </div>

          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-600">
            {vClass.description}
          </p>

          {/* What's included */}
          <section aria-labelledby="included" className="mt-9">
            <h2 id="included" className="text-xl">
              What&apos;s included
            </h2>
            <Checklist items={vClass.features} className="mt-4" />
          </section>

          {/* Stream choice for 11 / 12 */}
          {vClass.hasStreams ? (
            <StreamSelector value={stream} onChange={setStream} classId={vClass.id} />
          ) : null}
        </div>

        {/* Purchase rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-hairline bg-white p-6 shadow-panel">
            <p className="text-sm font-medium text-ink-500">{vClass.name} Complete Access</p>
            <p className="mt-1.5 text-4xl font-extrabold text-sun-600 nums">
              {formatINR(vClass.price)}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-700">One time payment</p>

            <ul className="mt-5 space-y-2 border-t border-hairline pt-5">
              {['Every subject', 'Every chapter', 'Lifetime access', 'No renewal'].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-ink-700">
                  <Check className="size-4 shrink-0 text-leaf-600" strokeWidth={3} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>

            <Button
              size="lg"
              fullWidth
              className="mt-6"
              disabled={needsStream}
              trailingIcon={<ArrowRight className="size-5" aria-hidden />}
              onClick={proceed}
            >
              {unlocked ? 'Explore content' : 'Proceed to Payment'}
            </Button>

            {unlocked ? (
              <div className="mt-2.5">
                <ButtonLink to={`/classes/${vClass.id}/subjects`} variant="soft" size="lg" fullWidth>
                  Go to subjects
                </ButtonLink>
              </div>
            ) : null}

            {needsStream ? (
              <p role="status" className="mt-3 text-center text-sm font-medium text-ink-500">
                Choose your stream to continue.
              </p>
            ) : null}

            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-ink-50 p-3.5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-leaf-600" aria-hidden />
              <div>
                <p className="text-sm font-bold text-ink-900">Secure Payment</p>
                <p className="mt-0.5 text-xs text-ink-500">Manual UPI · verified by our team</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Stream selector
   ------------------------------------------------------------------ */

function StreamSelector({
  value,
  onChange,
  classId,
}: {
  value: StreamId | null
  onChange: (stream: StreamId) => void
  classId: number
}) {
  const { data: streams } = useAsync<Stream[]>((signal) => fetchStreams(classId as ClassId, signal), [
    classId,
  ])
  const [open, setOpen] = useState(true)

  return (
    <section aria-labelledby="stream" className="mt-9">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="stream-list"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-hairline bg-white px-5 py-4 text-left shadow-card transition-colors hover:border-brand-300"
      >
        <span>
          <span id="stream" className="block text-[0.9375rem] font-bold text-ink-900">
            Choose Your Stream
          </span>
          <span className="mt-0.5 block text-sm text-ink-500">
            {value
              ? `Selected: ${streams?.find((s) => s.id === value)?.name ?? value}`
              : 'Required for Class 11 and Class 12'}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-5 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul id="stream-list" className="mt-3 grid gap-3 sm:grid-cols-3">
          {(streams ?? []).map((stream) => {
            const isSelected = value === stream.id
            return (
              <li key={stream.id}>
                <button
                  type="button"
                  onClick={() => onChange(stream.id)}
                  aria-pressed={isSelected}
                  className={`h-full w-full rounded-2xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                      : 'border-hairline bg-white hover:border-brand-300'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[0.9375rem] font-bold text-ink-900">{stream.name}</span>
                    {isSelected ? (
                      <Check className="size-4.5 shrink-0 text-brand-600" strokeWidth={3} aria-hidden />
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-500">
                    {stream.description}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
