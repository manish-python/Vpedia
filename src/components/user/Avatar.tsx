import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'

/* ========================================================================
   Avatar
   Uses the Google-provided photo when one exists, otherwise a monogram.
   Decorative when it sits beside the student's name.
   ===================================================================== */

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-24 text-2xl',
}

export function Avatar({
  name,
  avatarUrl,
  size = 'md',
  className,
  ring = false,
}: {
  name: string | null | undefined
  avatarUrl?: string | null
  size?: AvatarSize
  className?: string
  ring?: boolean
}) {
  const dimension = { sm: 32, md: 40, lg: 56, xl: 96 }[size]

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={dimension}
        height={dimension}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          'shrink-0 rounded-full bg-brand-100 object-cover',
          ring && 'ring-2 ring-white',
          SIZES[size],
          className,
        )}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full',
        'bg-gradient-to-br from-brand-500 to-grape-600 font-bold text-white',
        ring && 'ring-2 ring-white',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
