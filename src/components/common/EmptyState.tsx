import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'
import { Button, ButtonLink } from './Button'

/* ========================================================================
   EmptyState
   =================================================================== */

export interface EmptyStateProps {
  illustration?: ReactNode
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; to?: string; onClick?: () => void }
  secondaryAction?: { label: string; to?: string; onClick?: () => void }
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({
  illustration,
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/70 text-center',
        size === 'md' ? 'px-6 py-14' : 'px-5 py-9',
        className,
      )}
    >
      {illustration ?? (icon ? <div className="mb-4">{icon}</div> : null)}
      <h3 className={cn('font-bold text-ink-900', size === 'md' ? 'text-lg' : 'text-base')}>
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">{description}</p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          {action?.to ? (
            <ButtonLink to={action.to} size="md">
              {action.label}
            </ButtonLink>
          ) : action ? (
            <Button onClick={action.onClick} size="md">
              {action.label}
            </Button>
          ) : null}

          {secondaryAction?.to ? (
            <ButtonLink to={secondaryAction.to} variant="outline" size="md">
              {secondaryAction.label}
            </ButtonLink>
          ) : secondaryAction ? (
            <Button variant="outline" size="md" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ========================================================================
   ErrorState — always offers a retry when the failure is recoverable.
   =================================================================== */

export interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  retryLabel?: string
  action?: { label: string; to: string }
  className?: string
}

export function ErrorState({
  title = 'Unable to load content',
  message = 'Something went wrong. Please check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        aria-hidden
        className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-card"
      >
        ⚠️
      </div>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">{message}</p>
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        {onRetry ? (
          <Button onClick={onRetry} size="md">
            {retryLabel}
          </Button>
        ) : null}
        {action ? (
          <ButtonLink to={action.to} variant={onRetry ? 'outline' : 'primary'} size="md">
            {action.label}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  )
}

/* ========================================================================
   UnauthorizedState — used by the class/content route guards.
   =================================================================== */

export function UnauthorizedState({
  message = 'You need to purchase this class to access this content.',
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'mx-auto flex max-w-lg flex-col items-center rounded-3xl border border-hairline bg-white px-6 py-12 text-center shadow-card',
        className,
      )}
    >
      <div
        aria-hidden
        className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl"
      >
        🔒
      </div>
      <h1 className="text-xl font-bold text-ink-900">Access Restricted</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{message}</p>
      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <ButtonLink to="/classes" size="lg">
          Purchase Class
        </ButtonLink>
        <ButtonLink to="/dashboard" variant="outline" size="lg">
          Go to Dashboard
        </ButtonLink>
      </div>
    </div>
  )
}
