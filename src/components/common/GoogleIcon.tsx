import { cn } from '@/utils/cn'

/* ========================================================================
   Google brand mark
   Drawn as inline SVG so the login surface has no external icon
   dependency and renders correctly in every state.
   =================================================================== */

export function GoogleIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.13A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.26a7.2 7.2 0 0 1 0-4.52V6.61H1.27a12 12 0 0 0 0 10.78l4-3.13Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.13C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

/**
 * "Continue with Google" button.
 *
 * It deliberately does not collect a Google credential in the browser.
 * Sign-in is a full-page navigation to Django, which performs the OAuth
 * authorization-code exchange itself and sets the session cookie. That keeps
 * the client secret on the server and lets Django generate and validate the
 * `state` parameter, which a popup-based flow could not do as safely.
 *
 * No publishable Google client id is needed in the frontend at all.
 */
export function GoogleSignInButton({
  onClick,
  disabled = false,
  loading = false,
  className,
  label = 'Continue with Google',
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-hairline bg-white px-5',
        'text-[0.9375rem] font-semibold text-ink-800 shadow-card',
        'transition-[box-shadow,border-color,transform] duration-150',
        'hover:border-brand-300 hover:shadow-card-hover active:translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
    >
      <GoogleIcon size={19} />
      {loading ? 'Redirecting to Google…' : label}
    </button>
  )
}
