import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, GraduationCap, Loader2, LogOut, Sparkles } from 'lucide-react'

import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/common/Button'
import { ErrorState } from '@/components/common/EmptyState'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { fetchClasses } from '@/services/classService'
import { fetchStreams } from '@/services/classService'
import { updateCurrentClass } from '@/services/profileService'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { ClassId, StreamId, VClass } from '@/types'

/* ========================================================================
   Choose Your Class — /select-class
   ---------------------------------------------------------------------
   The first thing a brand-new student sees.

   Why this page exists: `StudentProfile.selected_class` is nullable and stays
   NULL for anyone who has not chosen. The dashboard used to paper over that by
   falling back to the first class in the catalogue, so a new student saw
   "Class 7" in *Your Classes* despite never having selected it. This page makes
   the missing selection visible and gives the student a way to fill it in.

   What it does NOT do: create, open or unlock a purchase. Selecting a class
   records a preference and nothing more — access still requires an approved
   `ClassPurchase`, which the backend checks independently.
   =================================================================== */

export function SelectClassPage() {
  const { user, logout, refresh } = useAuth()
  const navigate = useNavigate()

  const [classId, setClassId] = useState<ClassId | null>(null)
  const [streamId, setStreamId] = useState<StreamId | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: classes, isLoading, error: classesError, refetch } = useAsync<VClass[]>(
    (signal) => fetchClasses(signal),
    [],
  )

  useSeo({
    title: 'Choose Your Class',
    description: 'Select your class to personalise your learning experience.',
    path: '/select-class',
    noIndex: true,
  })

  // Classes 11 and 12 need a stream; 7-10 must not be given one.
  const selected = classes?.find((vClass) => vClass.id === classId) ?? null
  const needsStream = selected?.hasStreams ?? false

  const { data: streams, isLoading: streamsLoading } = useAsync(
    (signal) => fetchStreams(classId as ClassId, signal),
    [classId],
    { enabled: classId !== null && needsStream },
  )

  // Changing the class invalidates the stream: a Class 12 Science pick must
  // not survive switching to Class 10, which has none.
  const chooseClass = (next: ClassId) => {
    setClassId(next)
    setStreamId(null)
    setSaveError(null)
  }

  const canSave = classId !== null && (!needsStream || streamId !== null) && !saving

  const save = useCallback(async () => {
    if (classId === null) return
    if (needsStream && streamId === null) return

    setSaving(true)
    setSaveError(null)
    try {
      await updateCurrentClass(classId, streamId)
      // Re-read the session so `user.currentClassId` reflects what the server
      // actually stored, rather than what this page intended.
      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Unable to save your class selection.',
      )
    } finally {
      setSaving(false)
    }
  }, [classId, streamId, needsStream, navigate, refresh])

  // A student who has already chosen lands here only from a deliberate edit,
  // so preselect what the profile already says rather than starting blank.
  useEffect(() => {
    if (classId !== null) return
    const existing = user?.currentClassId ?? null
    if (existing !== null) setClassId(existing)
  }, [user?.currentClassId, classId])

  return (
    <div className="min-h-dvh bg-canvas pb-[env(safe-area-inset-bottom)]">
      <header className="border-b border-hairline bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-2 sm:gap-4">
          <Logo size={30} variant="inline" />
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<LogOut className="size-4" aria-hidden />}
            onClick={() => void logout()}
          >
            <span className="hidden sm:inline">Sign out</span>
            <span className="sm:hidden">Sign out</span>
          </Button>
        </div>
      </header>

      <main id="main" className="container-page py-8 sm:py-12">
        <div className="mx-auto w-full max-w-3xl">
          <div className="text-center">
            <span
              aria-hidden
              className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
            >
              <GraduationCap className="size-7" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
              Choose Your Class
            </h1>
            <p className="mt-2 text-ink-600">
              Select your class to personalise your learning experience.
            </p>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-500">
              This tells us what to show you first. It does not unlock any paid
              material — you still need to complete a purchase for the classes
              you want access to.
            </p>
          </div>

          {classesError ? (
            <div className="mt-8">
              <ErrorState
                title="Unable to load your classes"
                message="We could not fetch the class list. Please try again."
                onRetry={refetch}
              />
            </div>
          ) : isLoading ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-2xl border border-hairline bg-white"
                  aria-hidden
                />
              ))}
              <p className="sr-only" role="status">
                Loading classes
              </p>
            </div>
          ) : (
            <>
              <fieldset className="mt-8">
                <legend className="sr-only">Choose your class</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {classes?.map((vClass) => {
                    const active = classId === vClass.id
                    return (
                      <button
                        key={vClass.id}
                        type="button"
                        onClick={() => chooseClass(vClass.id)}
                        aria-pressed={active}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                          active
                            ? 'border-brand-600 bg-brand-50 shadow-brand'
                            : 'border-hairline bg-white hover:border-brand-300 hover:bg-brand-50/40',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-base font-bold text-ink-900">
                            {vClass.name}
                          </span>
                          <span className="nums mt-0.5 block text-sm text-ink-500">
                            {formatINR(vClass.price)}
                          </span>
                        </span>
                        {active ? (
                          <span
                            aria-hidden
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white"
                          >
                            <Check className="size-3.5" strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {needsStream ? (
                <fieldset className="mt-7">
                  <legend className="text-sm font-bold text-ink-800">
                    {selected?.name} requires a stream
                  </legend>
                  <p className="mt-1 text-sm text-ink-500">
                    Pick the stream you are studying.
                  </p>

                  {streamsLoading ? (
                    <p className="mt-3 flex items-center gap-2 text-sm text-ink-500">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Loading streams…
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {streams?.map((stream) => {
                        const active = streamId === stream.id
                        return (
                          <button
                            key={stream.id}
                            type="button"
                            onClick={() => setStreamId(stream.id)}
                            aria-pressed={active}
                            className={cn(
                              'rounded-xl border-2 p-3.5 text-left transition',
                              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                              active
                                ? 'border-brand-600 bg-brand-50'
                                : 'border-hairline bg-white hover:border-brand-300',
                            )}
                          >
                            <span className="block text-sm font-bold text-ink-900">
                              {stream.name}
                            </span>
                            {stream.description ? (
                              <span className="mt-0.5 block text-xs text-ink-500">
                                {stream.description}
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </fieldset>
              ) : null}

              {saveError ? (
                <div className="mt-6">
                  <ErrorState title="Could not save your selection" message={saveError} />
                </div>
              ) : null}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  You can change this later from your profile.
                </p>
                <Button
                  size="lg"
                  onClick={() => void save()}
                  disabled={!canSave}
                  loading={saving}
                  className="sm:w-auto"
                  fullWidth
                >
                  {saving ? 'Saving…' : 'Save and continue'}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}