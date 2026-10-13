import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '@/utils/cn'
import { Spinner } from './Spinner'

/* ========================================================================
   Button
   One component for every action in the product. Renders as <button>,
   <Link> or <a> depending on the props it is given.
   =================================================================== */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'success'
  | 'soft'
  | 'danger'

export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-brand hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-grape-600 text-white shadow-brand hover:bg-grape-700 active:bg-grape-800 disabled:bg-grape-300',
  success:
    'bg-leaf-600 text-white shadow-brand hover:bg-leaf-700 active:bg-leaf-700 disabled:bg-leaf-300',
  outline:
    'border border-brand-200 bg-white text-brand-700 hover:border-brand-400 hover:bg-brand-50 active:bg-brand-100',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-800 active:bg-ink-200',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200',
  danger: 'bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-600',
}

const SIZES: Record<ButtonSize, string> = {
  // Every size keeps at least a 40px touch target on mobile.
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-[0.9375rem] gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
}

interface BaseProps {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  className?: string
  children?: ReactNode
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  )
})

/* ---------------------------------------------------------------------
   ButtonLink — same visual language, navigates with React Router.
   ------------------------------------------------------------------ */

export interface ButtonLinkProps extends BaseProps {
  to: string
  ariaLabel?: string
  ariaDisabled?: boolean
  onClick?: () => void
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ariaLabel,
  ariaDisabled,
  onClick,
}: ButtonLinkProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled || undefined}
      tabIndex={ariaDisabled ? -1 : undefined}
      onClick={(event) => {
        if (ariaDisabled) {
          event.preventDefault()
          return
        }
        onClick?.()
      }}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:translate-y-px',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        ariaDisabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  )
}
