import { cn } from '@/utils/cn'

/* ========================================================================
   VPEDIA LEARNING brand mark
   ---------------------------------------------------------------------
   One treatment, used on the navbar, login card, dashboard sidebar,
   purchase and payment sheets, success screen, footer and mobile nav.

   The mark is an original rounded "V" bookplate with a play/spark detail
   — it borrows from no existing education or streaming brand.
   =================================================================== */

export function LogoMark({
  className,
  size = 40,
}: {
  className?: string
  size?: number
}) {
  const gradientId = `vp-mark-${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="VPEDIA Learning logo"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b76f6" />
          <stop offset="55%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradientId})`} />
      {/* The V */}
      <path
        d="M12 13.5h5.9l6.1 11.4 6.1-11.4H36L26.6 34.5h-5.2L12 13.5Z"
        fill="#ffffff"
        fillOpacity="0.96"
      />
      {/* Open-book underline, hinting at study material */}
      <path
        d="M15.5 36.5c3.2-1.5 5.4-1.5 8.5 0 3.1-1.5 5.3-1.5 8.5 0"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.62"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Spark */}
      <circle cx="36.5" cy="13.5" r="2.6" fill="#ffd166" />
    </svg>
  )
}

export interface LogoProps {
  /** Visual size of the mark in pixels. */
  size?: number
  className?: string
  /**
   * `full`   — mark + "VPEDIA" over "LEARNING"
   * `mark`   — mark only (mobile bottom nav)
   * `inline` — single-line lockup for tight spaces
   */
  variant?: 'full' | 'mark' | 'inline'
  /** Slightly reduced sizing for dense surfaces. */
  tone?: 'default' | 'onDark'
}

export function Logo({ size = 40, className, variant = 'full' }: LogoProps) {
  if (variant === 'mark') {
    return <LogoMark size={size} className={className} />
  }

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-2.5', className)}>
        <LogoMark size={size} />
        <span className="text-lg font-extrabold tracking-tight text-brand-700">VPEDIA</span>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[1.0625rem] font-extrabold tracking-tight text-brand-700 sm:text-xl">
          VPEDIA
        </span>
        <span className="mt-0.5 text-[0.5625rem] font-bold tracking-[0.22em] text-grape-600 uppercase sm:text-[0.625rem]">
          Learning
        </span>
      </span>
    </span>
  )
}
