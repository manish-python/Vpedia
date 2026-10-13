import { cn } from '@/utils/cn'

/* ========================================================================
   Illustration system
   ---------------------------------------------------------------------
   Original, hand-built SVG artwork in one consistent flat style:
   rounded shapes, a shared brand palette, soft ground shadows, no
   gradients beyond a light wash and no stock photography.

   Every illustration is decorative, so all of them are aria-hidden. The
   surrounding component always carries the accessible text.
   ===================================================================== */

export interface IllustrationProps {
  className?: string
  /** Rendered size in pixels; artwork scales from a 200-unit viewBox. */
  size?: number
}

const GROUND = '#e6ecfb'

/* ---------------------------------------------------------------------
   Hero — student studying at a desk with a laptop and a book stack
   ------------------------------------------------------------------ */
export function HeroIllustration({ className, size = 380 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <defs>
        <linearGradient id="vp-hero-shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b76f6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id="vp-hero-hoodie" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <clipPath id="vp-hero-screen">
          <rect x="72" y="96" width="56" height="38" rx="3" />
        </clipPath>
      </defs>

      {/* Soft backdrop blobs */}
      <circle cx="48" cy="52" r="26" fill="#dbe8fe" />
      <circle cx="160" cy="40" r="18" fill="#ede9fe" />
      <circle cx="168" cy="120" r="14" fill="#e0f2fe" />

      {/* Desk */}
      <rect x="34" y="150" width="132" height="8" rx="4" fill="#cbd5e1" />
      <rect x="46" y="158" width="7" height="26" rx="3.5" fill="#cbd5e1" />
      <rect x="147" y="158" width="7" height="26" rx="3.5" fill="#cbd5e1" />

      {/* Student torso + hoodie */}
      <path
        d="M74 150c-2-16 4-30 14-36l10-5h20l10 5c10 6 16 20 14 36H74Z"
        fill="url(#vp-hero-hoodie)"
      />
      {/* Hoodie pocket detail */}
      <path
        d="M96 138h24v14a4 4 0 0 1-4 4h-16a4 4 0 0 1-4-4v-14Z"
        fill="#6d28d9"
        fillOpacity="0.55"
      />

      {/* Head */}
      <circle cx="100" cy="88" r="21" fill="#ffd9b8" />
      {/* Hair */}
      <path
        d="M79 86c0-12 9-20 21-20s21 8 21 20c0 2-1 4-2 5-1-8-6-11-11-11-6 0-9 2-14 2-4 0-7 2-8 6-1-1-1-1-2-2Z"
        fill="#2f2a45"
      />
      <path d="M121 88c2-1 3 1 3 3s-2 3-4 2l1-5Z" fill="#ffd9b8" />
      {/* Eyes + smile */}
      <circle cx="93" cy="89" r="2.1" fill="#2f2a45" />
      <circle cx="107" cy="89" r="2.1" fill="#2f2a45" />
      <path d="M95 97c2.6 2.4 6.4 2.4 9 0" stroke="#2f2a45" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Arm reaching to the laptop */}
      <path
        d="M76 128c-8 4-14 12-16 22-1 4 2 7 6 6 8-2 14-8 18-16"
        fill="#8b5cf6"
      />
      <circle cx="66" cy="156" r="6.5" fill="#ffd9b8" />

      {/* Laptop */}
      <rect x="70" y="94" width="60" height="42" rx="5" fill="#3f4a63" />
      <rect x="72" y="96" width="56" height="38" rx="3" fill="#eaf2ff" />
      <g clipPath="url(#vp-hero-screen)" fill="#93bbfd">
        <rect x="78" y="102" width="30" height="3.5" rx="1.75" />
        <rect x="78" y="110" width="44" height="3.5" rx="1.75" />
        <rect x="78" y="118" width="24" height="3.5" rx="1.75" />
      </g>
      <rect x="76" y="101" width="16" height="16" rx="4" fill="#2563eb" />
      <path d="M64 138h72a3 3 0 0 1-3 4H67a3 3 0 0 1-3-4Z" fill="#64748b" />

      {/* Book stack on the desk */}
      <rect x="140" y="138" width="34" height="6" rx="2" fill="#f43f75" />
      <rect x="143" y="132" width="31" height="6" rx="2" fill="#2563eb" />
      <rect x="140" y="126" width="30" height="6" rx="2" fill="#f59e0b" />

      {/* Floating study chips */}
      <g>
        <rect x="16" y="86" width="42" height="19" rx="9.5" fill="#ffffff" stroke="#bfd7fe" />
        <rect x="22" y="92" width="9" height="7" rx="2" fill="#2563eb" />
        <rect x="35" y="93" width="17" height="2.6" rx="1.3" fill="#94a3b8" />
        <rect x="35" y="97.5" width="11" height="2.6" rx="1.3" fill="#cbd5e1" />
      </g>
      <g>
        <rect x="150" y="70" width="38" height="19" rx="9.5" fill="#ffffff" stroke="#ddd6fe" />
        <rect x="156" y="76" width="8" height="7" rx="2" fill="#7c3aed" />
        <rect x="168" y="77" width="14" height="2.6" rx="1.3" fill="#94a3b8" />
        <rect x="168" y="81.5" width="9" height="2.6" rx="1.3" fill="#cbd5e1" />
      </g>
      <g>
        <rect x="26" y="126" width="46" height="19" rx="9.5" fill="#ffffff" stroke="#bae6fd" />
        <rect x="32" y="132" width="8" height="7" rx="2" fill="#0ea5e9" />
        <rect x="44" y="133" width="21" height="2.6" rx="1.3" fill="#94a3b8" />
        <rect x="44" y="137.5" width="14" height="2.6" rx="1.3" fill="#cbd5e1" />
      </g>
      <g>
        <rect x="132" y="22" width="56" height="20" rx="10" fill="#ffffff" stroke="#bbf7d0" />
        <rect x="139" y="28" width="9" height="8" rx="2" fill="#16a34a" />
        <rect x="152" y="29" width="29" height="2.8" rx="1.4" fill="#94a3b8" />
        <rect x="152" y="33.5" width="19" height="2.8" rx="1.4" fill="#cbd5e1" />
      </g>
      <g>
        <rect x="30" y="30" width="34" height="19" rx="9.5" fill="#ffffff" stroke="#fde68a" />
        <rect x="36" y="36" width="9" height="7" rx="2" fill="#f59e0b" />
        <rect x="49" y="37" width="9" height="2.6" rx="1.3" fill="#94a3b8" />
      </g>

      {/* Pen + pencil */}
      <rect x="118" y="148" width="18" height="3.6" rx="1.8" fill="#f59e0b" transform="rotate(-12 118 148)" />

      <ellipse cx="100" cy="188" rx="62" ry="7" fill={GROUND} />
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Login — graduation cap resting on a stack of books
   ------------------------------------------------------------------ */
export function LoginIllustration({ className, size = 220 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <defs>
        <linearGradient id="vp-login-cap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id="vp-login-cap2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>

      <circle cx="100" cy="96" r="72" fill="#f4f7ff" />
      <circle cx="46" cy="52" r="12" fill="#ede9fe" />
      <circle cx="160" cy="66" r="9" fill="#dbe8fe" />
      <path d="M158 30l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2-6.5-3.4-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1L158 30Z" fill="#ffd166" />

      {/* Book stack */}
      <rect x="52" y="146" width="96" height="11" rx="4" fill="#2563eb" />
      <rect x="46" y="132" width="88" height="12" rx="4" fill="#f59e0b" />
      <rect x="58" y="118" width="84" height="12" rx="4" fill="#16a34a" />
      <rect x="52" y="104" width="76" height="12" rx="4" fill="#f43f75" />
      {/* Page edges */}
      <g fill="#ffffff" fillOpacity="0.85">
        <rect x="140" y="107" width="3" height="6" rx="1.5" />
        <rect x="146" y="107" width="3" height="6" rx="1.5" />
        <rect x="122" y="121" width="3" height="6" rx="1.5" />
        <rect x="128" y="121" width="3" height="6" rx="1.5" />
        <rect x="112" y="135" width="3" height="6" rx="1.5" />
        <rect x="118" y="135" width="3" height="6" rx="1.5" />
      </g>

      {/* Mortarboard */}
      <path d="M100 40l52 24-52 24-52-24 52-24Z" fill="url(#vp-login-cap)" />
      <path d="M70 72v20c0 5 13.5 11 30 11s30-6 30-11V72l-30 14-30-14Z" fill="url(#vp-login-cap2)" />
      <rect x="95" y="84" width="10" height="26" rx="3" fill="#ffd166" />
      <circle cx="100" cy="113" r="6" fill="#ffd166" />

      <ellipse cx="100" cy="168" rx="66" ry="8" fill={GROUND} />
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Dashboard — student seated at a desk with a laptop
   ------------------------------------------------------------------ */
export function DashboardIllustration({ className, size = 190 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <defs>
        <linearGradient id="vp-dash-shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd166" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      <circle cx="164" cy="34" r="20" fill="#e0f2fe" />
      <circle cx="30" cy="30" r="12" fill="#ede9fe" />

      {/* Desk */}
      <rect x="18" y="126" width="164" height="8" rx="4" fill="#cbd5e1" />
      <rect x="30" y="134" width="7" height="20" rx="3.5" fill="#cbd5e1" />
      <rect x="163" y="134" width="7" height="20" rx="3.5" fill="#cbd5e1" />

      {/* Student */}
      <path d="M70 126c-2-14 3-24 11-28l8-4h14l8 4c8 4 13 14 11 28H70Z" fill="url(#vp-dash-shirt)" />
      <circle cx="96" cy="72" r="19" fill="#ffd9b8" />
      <path
        d="M77 70c0-11 8-18 19-18s19 7 19 18c0 2-1 3-2 4-1-7-5-9-10-9s-8 2-12 2c-3.5 0-6 1.6-7 5-1-.6-1.5-.9-2-2Z"
        fill="#2f2a45"
      />
      <circle cx="90" cy="73" r="1.9" fill="#2f2a45" />
      <circle cx="102" cy="73" r="1.9" fill="#2f2a45" />
      <path d="M91 80c2.4 2.2 5.6 2.2 8 0" stroke="#2f2a45" strokeWidth="1.9" fill="none" strokeLinecap="round" />

      {/* Arm to laptop */}
      <path d="M72 108c-7 4-11 10-12 18" stroke="#f59e0b" strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="60" cy="127" r="5.5" fill="#ffd9b8" />

      {/* Laptop */}
      <rect x="112" y="80" width="52" height="38" rx="5" fill="#3f4a63" />
      <rect x="114" y="82" width="48" height="34" rx="3" fill="#eaf2ff" />
      <g fill="#93bbfd">
        <rect x="119" y="88" width="26" height="3" rx="1.5" />
        <rect x="119" y="95" width="38" height="3" rx="1.5" />
        <rect x="119" y="102" width="20" height="3" rx="1.5" />
      </g>
      <rect x="106" y="118" width="64" height="5" rx="2.5" fill="#64748b" />

      {/* Mug */}
      <rect x="176" y="108" width="16" height="18" rx="3" fill="#f43f75" />
      <path d="M192 113h4a4 4 0 0 1 0 8h-4" stroke="#f43f75" strokeWidth="3" fill="none" />
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Success — celebrating student with raised arms and confetti
   ------------------------------------------------------------------ */
export function SuccessIllustration({ className, size = 220 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <defs>
        <linearGradient id="vp-success-shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>

      {/* Confetti */}
      <g>
        <rect x="20" y="34" width="7" height="12" rx="2" fill="#2563eb" transform="rotate(-24 23 40)" />
        <rect x="176" y="26" width="7" height="12" rx="2" fill="#f43f75" transform="rotate(30 179 32)" />
        <rect x="34" y="76" width="6" height="10" rx="2" fill="#f59e0b" transform="rotate(18 37 81)" />
        <rect x="168" y="88" width="6" height="10" rx="2" fill="#16a34a" transform="rotate(-32 171 93)" />
        <circle cx="58" cy="20" r="4" fill="#ffd166" />
        <circle cx="150" cy="18" r="4" fill="#0ea5e9" />
        <circle cx="14" cy="112" r="3.5" fill="#7c3aed" />
        <circle cx="190" cy="120" r="3.5" fill="#2563eb" />
        <path d="M160 60l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L160 60Z" fill="#ffd166" />
        <path d="M42 116l2 4.1 4.5.6-3.2 3.2.7 4.5-4-2.1-4 2.1.8-4.5-3.3-3.2 4.5-.6L42 116Z" fill="#f43f75" />
      </g>

      {/* Student, arms raised */}
      <path d="M76 152c-2-16 3-28 11-33l8-5h14l8 5c8 5 13 17 11 33H76Z" fill="url(#vp-success-shirt)" />
      {/* Arms up */}
      <path
        d="M80 122c-9-8-14-18-16-28"
        stroke="#7c3aed"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M124 122c9-8 14-18 16-28"
        stroke="#7c3aed"
        strokeWidth="11"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="62" cy="90" r="7.5" fill="#ffd9b8" />
      <circle cx="142" cy="90" r="7.5" fill="#ffd9b8" />

      {/* Head */}
      <circle cx="102" cy="96" r="21" fill="#ffd9b8" />
      <path
        d="M82 94c0-12 9-20 20-20s20 8 20 20c0 2 0 3-1 4-1-8-6-11-11-11-5 0-8 2-12 2-4 0-6 2-7 5-1 0-1 0-2 0Z"
        fill="#2f2a45"
      />
      <path d="M96 100c1-2 2-3 3-3s2 1 3 3" stroke="#2f2a45" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="95" cy="98" r="2" fill="#2f2a45" />
      <circle cx="109" cy="98" r="2" fill="#2f2a45" />
      <path d="M95 106c4 4.4 10 4.4 14 0" stroke="#2f2a45" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      <ellipse cx="102" cy="162" rx="54" ry="8" fill={GROUND} />
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Empty — open folder with a bookmark
   ------------------------------------------------------------------ */
export function EmptyIllustration({ className, size = 170 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <circle cx="100" cy="78" r="60" fill="#f4f7ff" />
      <path d="M46 52h34l8 12h66a6 6 0 0 1 6 6v46a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V58a6 6 0 0 1 6-6Z" fill="#dbe8fe" />
      <path d="M46 74h112a6 6 0 0 1 6 6v40a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V80a6 6 0 0 1 6-6Z" fill="#ffffff" />
      <path d="M40 82h122v38a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V82Z" fill="#eff6ff" />
      <rect x="86" y="96" width="30" height="20" rx="3" fill="#bfd7fe" />
      <rect x="96" y="88" width="10" height="28" rx="2" fill="#2563eb" />
      <circle cx="152" cy="34" r="6" fill="#ffd166" />
      <circle cx="44" cy="26" r="4" fill="#c4b5fd" />
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Not found — a compass and a book, gently lost
   ------------------------------------------------------------------ */
export function NotFoundIllustration({ className, size = 200 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 180"
      width={size}
      height={(size * 180) / 200}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <circle cx="100" cy="86" r="64" fill="#f4f7ff" />

      {/* Compass */}
      <circle cx="100" cy="86" r="42" fill="#ffffff" stroke="#bfd7fe" strokeWidth="5" />
      <circle cx="100" cy="86" r="33" fill="#eff6ff" />
      <path d="M100 86l16-16-6 26-10 10-6-26 6 6Z" fill="#f43f75" />
      <path d="M100 86l-16 16 6-26 10-10 6 26-6-6Z" fill="#2563eb" />
      <circle cx="100" cy="86" r="4" fill="#2f2a45" />
      <text x="100" y="62" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8">N</text>

      {/* Loose book */}
      <rect x="24" y="126" width="58" height="10" rx="3" fill="#7c3aed" />
      <rect x="28" y="136" width="54" height="10" rx="3" fill="#0ea5e9" />
      <rect x="26" y="146" width="56" height="10" rx="3" fill="#f59e0b" />
      <circle cx="164" cy="140" r="5" fill="#ffd166" />
      <circle cx="150" cy="26" r="4" fill="#93bbfd" />
      <ellipse cx="100" cy="164" rx="66" ry="7" fill={GROUND} />
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Locked — a padlock resting on a book
   ------------------------------------------------------------------ */
export function LockedIllustration({ className, size = 190 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 180"
      width={size}
      height={(size * 180) / 200}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <circle cx="100" cy="86" r="62" fill="#f4f7ff" />

      {/* Book */}
      <rect x="46" y="126" width="108" height="11" rx="4" fill="#2563eb" />
      <rect x="52" y="114" width="96" height="11" rx="4" fill="#93bbfd" />
      <g fill="#ffffff" fillOpacity="0.8">
        <rect x="138" y="117" width="3" height="6" rx="1.5" />
        <rect x="144" y="117" width="3" height="6" rx="1.5" />
      </g>

      {/* Padlock body */}
      <rect x="72" y="70" width="56" height="46" rx="12" fill="#3b76f6" />
      <rect x="72" y="70" width="56" height="12" rx="6" fill="#2563eb" />
      {/* Shackle */}
      <path
        d="M84 70v-10a16 16 0 0 1 32 0v10"
        stroke="#2563eb"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="100" cy="88" r="6" fill="#ffffff" />
      <rect x="97" y="90" width="6" height="14" rx="3" fill="#ffffff" />

      {/* Rays */}
      <g stroke="#ffd166" strokeWidth="4" strokeLinecap="round">
        <path d="M34 66h-10" />
        <path d="M40 40l-7-7" />
        <path d="M166 66h10" />
        <path d="M160 40l7-7" />
      </g>
    </svg>
  )
}

/* ---------------------------------------------------------------------
   Search — magnifier over a book stack
   ------------------------------------------------------------------ */
export function SearchIllustration({ className, size = 170 }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      aria-hidden
      focusable="false"
      className={cn('select-none', className)}
    >
      <circle cx="92" cy="76" r="52" fill="#f4f7ff" />
      <rect x="46" y="104" width="92" height="10" rx="4" fill="#2563eb" />
      <rect x="52" y="92" width="80" height="10" rx="4" fill="#f59e0b" />
      <rect x="48" y="80" width="72" height="10" rx="4" fill="#16a34a" />
      <circle cx="102" cy="58" r="26" fill="#ffffff" fillOpacity="0.95" stroke="#bfd7fe" strokeWidth="6" />
      <path d="M121 77l16 16" stroke="#2563eb" strokeWidth="9" strokeLinecap="round" />
      <path d="M92 48h20M92 58h14M92 68h17" stroke="#93bbfd" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
