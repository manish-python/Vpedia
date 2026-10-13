import { cn } from '@/utils/cn'
import type { ClassId } from '@/types'

/* ========================================================================
   Class artwork
   ---------------------------------------------------------------------
   The class selection screen shows a distinct illustration per class:
   7 books · 8 globe · 9 paper plane · 10 graduation cap ·
   11 laptop · 12 atom. Rendered from data so the grid stays data-driven.
   =================================================================== */

export interface ClassArtworkProps {
  classId: ClassId
  className?: string
  size?: number
}

const S = { blue: '#2563eb', blueSoft: '#93bbfd', grape: '#7c3aed', grapeSoft: '#c4b5fd', leaf: '#16a34a', leafSoft: '#86efac', sun: '#f59e0b', sunSoft: '#fcd34d', sky: '#0ea5e9', skySoft: '#7dd3fc', rose: '#f43f75', roseSoft: '#fda4bd', ink: '#2f2a45' }

function Frame({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      className={cn('select-none', tint)}
    >
      <rect width="64" height="64" rx="18" fill="currentColor" fillOpacity="0.09" />
      {children}
    </svg>
  )
}

export function ClassArtwork({ classId, className, size = 56 }: ClassArtworkProps) {
  const common = { className: cn('select-none', className), width: size, height: size }

  switch (classId) {
    /* Class 7 — book stack */
    case 7:
      return (
        <svg viewBox="0 0 64 64" aria-hidden focusable="false" {...common}>
          <rect width="64" height="64" rx="18" fill="#eff5ff" />
          <rect x="13" y="40" width="38" height="8" rx="3" fill={S.blue} />
          <rect x="17" y="31" width="34" height="8" rx="3" fill={S.sun} />
          <rect x="13" y="22" width="30" height="8" rx="3" fill={S.leaf} />
          <path d="M32 15l14 5-14 5-14-5 14-5Z" fill={S.grape} />
          <path d="M22 21.5V26c0 1.5 4.5 3 10 3s10-1.5 10-3v-4.5" fill={S.grapeSoft} />
          <g fill="#ffffff" fillOpacity="0.9">
            <rect x="46" y="25" width="2.5" height="4" rx="1.2" />
            <rect x="50" y="25" width="2.5" height="4" rx="1.2" />
            <rect x="42" y="34" width="2.5" height="4" rx="1.2" />
            <rect x="46" y="34" width="2.5" height="4" rx="1.2" />
          </g>
        </svg>
      )

    /* Class 8 — globe */
    case 8:
      return (
        <svg viewBox="0 0 64 64" aria-hidden focusable="false" {...common}>
          <rect width="64" height="64" rx="18" fill="#f0fdf4" />
          <circle cx="32" cy="32" r="19" fill={S.leafSoft} />
          <path d="M32 13a19 19 0 0 1 0 38 19 19 0 0 1 0-38Z" fill={S.leaf} />
          <ellipse cx="32" cy="32" rx="8" ry="19" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeOpacity="0.85" />
          <path d="M14 26h36M14 38h36" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.85" />
          <path d="M32 11v42" stroke="#ffffff" strokeWidth="2.2" strokeOpacity="0.55" />
        </svg>
      )

    /* Class 9 — paper plane */
    case 9:
      return (
        <svg viewBox="0 0 64 64" aria-hidden focusable="false" {...common}>
          <rect width="64" height="64" rx="18" fill="#f5f3ff" />
          <circle cx="46" cy="18" r="6" fill={S.sunSoft} />
          <path d="M10 34l44-16-16 40-8-16-20-8Z" fill={S.grape} />
          <path d="M30 42l24-24-32 32 8-8Z" fill="#ffffff" fillOpacity="0.55" />
          <path d="M16 50c6-2 10-5 13-9" stroke={S.grapeSoft} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
        </svg>
      )

    /* Class 10 — graduation cap */
    case 10:
      return (
        <svg viewBox="0 0 64 64" aria-hidden focusable="false" {...common}>
          <rect width="64" height="64" rx="18" fill="#f0f9ff" />
          <path d="M32 16l22 10-22 10-22-10 22-10Z" fill={S.blue} />
          <path d="M20 30v9c0 3 5.5 5.5 12 5.5s12-2.5 12-5.5v-9l-12 5.5L20 30Z" fill={S.sky} />
          <rect x="29.5" y="35" width="5" height="11" rx="1.6" fill={S.sun} />
          <circle cx="32" cy="48" r="3.4" fill={S.sun} />
        </svg>
      )

    /* Class 11 — laptop */
    case 11:
      return (
        <svg viewBox="0 0 64 64" aria-hidden focusable="false" {...common}>
          <rect width="64" height="64" rx="18" fill="#f5f3ff" />
          <rect x="15" y="16" width="34" height="25" rx="3.5" fill={S.grape} />
          <rect x="17.5" y="18.5" width="29" height="20" rx="2" fill="#eff6ff" />
          <g fill={S.grapeSoft}>
            <rect x="21" y="23" width="13" height="2.4" rx="1.2" />
            <rect x="21" y="28" width="20" height="2.4" rx="1.2" />
            <rect x="21" y="33" width="10" height="2.4" rx="1.2" />
          </g>
          <path d="M10 41h44l2 6a2 2 0 0 1-2 2.5H10a2 2 0 0 1-2-2.5l2-6Z" fill={S.grape} />
          <rect x="26" y="43.5" width="12" height="2" rx="1" fill="#ffffff" fillOpacity="0.7" />
        </svg>
      )

    /* Class 12 — atom */
    case 12:
      return (
        <svg viewBox="0 0 64 64" aria-hidden focusable="false" {...common}>
          <rect width="64" height="64" rx="18" fill="#fff8ed" />
          <g stroke={S.sun} strokeWidth="2.6" fill="none">
            <ellipse cx="32" cy="32" rx="20" ry="8" />
            <ellipse cx="32" cy="32" rx="20" ry="8" transform="rotate(60 32 32)" />
            <ellipse cx="32" cy="32" rx="20" ry="8" transform="rotate(-60 32 32)" />
          </g>
          <circle cx="32" cy="32" r="6" fill={S.sun} />
          <circle cx="50" cy="27" r="3.4" fill={S.blue} />
          <circle cx="18" cy="43" r="3.4" fill={S.rose} />
          <circle cx="41" cy="47" r="3.4" fill={S.leaf} />
        </svg>
      )

    default:
      return (
        <Frame tint="text-brand-600">
          <rect x="20" y="18" width="24" height="28" rx="4" fill="currentColor" />
        </Frame>
      )
  }
}

/* ---------------------------------------------------------------------
   Small subject glyphs used inside rows (sidebar, list badges)
   ------------------------------------------------------------------ */
export function StreamChip({
  label,
  tone = 'grape',
  className,
}: {
  label: string
  tone?: 'grape' | 'blue' | 'leaf'
  className?: string
}) {
  const tones = {
    grape: 'bg-grape-50 text-grape-700 border-grape-200',
    blue: 'bg-brand-50 text-brand-700 border-brand-200',
    leaf: 'bg-leaf-50 text-leaf-700 border-leaf-200',
  }
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
