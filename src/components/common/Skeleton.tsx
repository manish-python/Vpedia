import { cn } from '@/utils/cn'

/* ========================================================================
   Skeletons
   Every data surface has a matching placeholder so a page never shows a
   blank screen while loading.
   =================================================================== */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton-base', className)} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

/** Class tile skeleton — mirrors the class grid. */
export function SkeletonClassGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading classes"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-hairline bg-white p-4 shadow-card">
          <Skeleton className="mx-auto size-12 rounded-2xl" />
          <Skeleton className="mx-auto mt-3 h-4 w-16" />
          <Skeleton className="mx-auto mt-2 h-3 w-20" />
          <Skeleton className="mt-4 h-9 w-full rounded-xl" />
        </div>
      ))}
    </div>
  )
}

/** Subject tile skeleton — mirrors the subject grid. */
export function SkeletonSubjectGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading subjects"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-hairline bg-white p-5 shadow-card">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="mt-4 h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

/** Stacked row skeleton — chapters, content rows, PYQs, library. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-hairline bg-white p-4">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
          <Skeleton className="hidden h-9 w-20 rounded-xl sm:block" />
        </div>
      ))}
    </div>
  )
}

/** Generic panel skeleton — dashboard cards, profile, hero. */
export function SkeletonPanel({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-hairline bg-white p-5 shadow-card', className)}>
      <Skeleton className="h-4 w-32" />
      <SkeletonText lines={2} className="mt-4" />
    </div>
  )
}

/** Dashboard-specific layout skeleton. */
export function SkeletonDashboard() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-5">
      <Skeleton className="h-28 rounded-2xl sm:h-32" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

/** PDF viewer shell skeleton. */
export function SkeletonViewer() {
  return (
    <div role="status" aria-label="Loading document" className="flex gap-4">
      <Skeleton className="hidden w-36 shrink-0 space-y-3 md:block" />
      <div className="flex-1 space-y-4">
        <Skeleton className="mx-auto h-16 w-full max-w-3xl rounded-xl" />
        <Skeleton className="mx-auto h-96 w-full max-w-3xl rounded-xl" />
      </div>
    </div>
  )
}

/** Library skeleton. */
export function SkeletonLibrary() {
  return (
    <div role="status" aria-label="Loading library" className="space-y-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-hairline bg-white p-4">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
          <Skeleton className="hidden h-6 w-16 rounded-full sm:block" />
        </div>
      ))}
    </div>
  )
}
