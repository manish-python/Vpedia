import { cn } from '@/utils/cn'

/** Indeterminate progress indicator. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current',
        className,
      )}
    />
  )
}

/** Full-area loader for route transitions and the viewer. */
export function Loader({
  label = 'Loading…',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}
    >
      <Spinner size={28} className="text-brand-600" />
      <p className="text-sm font-medium text-ink-500">{label}</p>
    </div>
  )
}
