import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/utils/cn'

/* ========================================================================
   IconButton — square, always at least a 40px touch target.
   `label` is required: an icon-only control must still be announced.
   =================================================================== */

export type IconButtonVariant = 'ghost' | 'outline' | 'solid' | 'soft'
export type IconButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 active:bg-ink-200',
  outline: 'border border-hairline bg-white text-ink-600 hover:border-brand-300 hover:text-brand-700',
  solid: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200',
}

const SIZES: Record<IconButtonSize, string> = {
  sm: 'size-9 rounded-lg',
  md: 'size-10 rounded-xl',
  lg: 'size-11 rounded-xl',
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
