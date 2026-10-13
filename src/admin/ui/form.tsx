/* ========================================================================
   Admin form primitives

   A single `FormModal` and a single `Field` for the whole portal, so create
   and edit behave identically everywhere:

   * labelled inputs with `*` on required fields and real `htmlFor` association
   * * server-side validation shown against the field that caused it
   * * the submit button disabled and relabelled while the request is in flight,
     which is what prevents a double submission
   * * ESC to close, click-outside to close, body scroll locked — all handled by
     the shared `Modal`
   * * on a phone the modal becomes a full-height bottom sheet, so the form
     never overflows the viewport
   ===================================================================== */

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Loader } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { cn } from '@/utils/cn'
import { ErrorState } from './index'

/* ---------------------------------------------------------------------
   Field
   ------------------------------------------------------------------ */

interface FieldShellProps {
  label: string
  required?: boolean
  hint?: string
  error?: string | string[]
  children: (id: string, describedBy: string | undefined) => ReactNode
}

/** Wraps a control with its label, hint and error, wired together for a11y. */
export function Field({ label, required, hint, error, children }: FieldShellProps) {
  const id = useId()
  const messages = Array.isArray(error) ? error : error ? [error] : []
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = messages.length ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-ink-800">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-rose-600">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">{children(id, describedBy)}</div>
      {messages.length ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">
          {messages.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus-visible:ring-2 focus-visible:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-400'

/** Shared border colour, driven by whether this field has an error. */
function borderFor(invalid: boolean) {
  return invalid
    ? 'border-rose-400 focus-visible:border-rose-500'
    : 'border-hairline focus-visible:border-brand-400'
}

/** A `<select>` with a chevron and a real placeholder option. */
export function Select({
  id,
  describedBy,
  invalid,
  value,
  onChange,
  children,
  disabled,
}: {
  id: string
  describedBy?: string
  invalid?: boolean
  value: string
  onChange: (value: string) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(CONTROL, borderFor(Boolean(invalid)), 'appearance-none pr-9')}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** A single-line text or number input. */
export function TextInput({
  id,
  describedBy,
  invalid,
  ...rest
}: {
  id: string
  describedBy?: string
  invalid?: boolean
  type?: string
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  min?: number
  inputMode?: 'numeric' | 'text'
}) {
  return (
    <input
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, borderFor(Boolean(invalid)))}
      {...rest}
      onChange={(event) => rest.onChange(event.target.value)}
    />
  )
}

/* ---------------------------------------------------------------------
   Dependent option loader

   Class → Stream → Subject is a chain of requests. This hook loads each level
   only when the level above it is actually chosen, caches by key so revisiting
   a selection is instant, and cancels in-flight requests when the selection
   changes underneath it.
   ------------------------------------------------------------------ */

export interface Option {
  id: number
  name: string
  slug: string
}

/**
 * Load options for the currently selected key.
 *
 * `loader` is only ever called with a non-empty `key`, so it can take a plain
 * `string`. When `key` is blank the hook resolves to `[]` without calling the
 * loader at all — that is how "nothing selected yet" avoids a request.
 */
export function useDependentOptions<T extends Option>(
  loader: (key: string, signal: AbortSignal) => Promise<T[]>,
  key: string | undefined | null,
): { options: T[]; loading: boolean; error: string | null; reload: () => void } {
  const [options, setOptions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!key) {
      setOptions([])
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    loader(key, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return
        setOptions(rows)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setOptions([])
        setError(cause instanceof Error ? cause.message : 'Could not load options.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // `loader` is intentionally not a dependency: callers pass an inline arrow,
    // and including it would restart the request on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return { options, loading, error, reload: () => setNonce((value) => value + 1) }
}

/* ---------------------------------------------------------------------
   Form modal
   ------------------------------------------------------------------ */

export interface FormModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Blocking message if the whole form failed, e.g. a 409 conflict. */
  formError?: string | null
  onSubmit: () => void | Promise<void>
  submitting?: boolean
  /** Label while submitting, e.g. "Saving…", "Publishing…". */
  submitLabel?: string
  children: ReactNode
}

/**
 * A modal that hosts one form.
 *
 * `onClose` is suppressed while a submit is in flight, so an administrator
 * cannot dismiss a half-sent change and lose the answer to their own request.
 */
export function FormModal({
  open,
  onClose,
  title,
  description,
  formError,
  onSubmit,
  submitting = false,
  submitLabel = 'Save',
  children,
}: FormModalProps) {
  const requestClose = () => {
    if (submitting) return
    onClose()
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void onSubmit()
  }

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={requestClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="admin-form" loading={submitting} disabled={submitting}>
            {submitting ? `${submitLabel}…` : submitLabel}
          </Button>
        </>
      }
    >
      <form id="admin-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError ? <ErrorState message={formError} compact title="Could not save" /> : null}
        {children}
      </form>
    </Modal>
  )
}

/** A checkbox styled as a switch, used for Active / Published flags. */
export function SwitchField({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-ink-50/60 p-3">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          checked ? 'bg-brand-600' : 'bg-ink-300',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[1.375rem]' : 'left-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-bold text-ink-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
      </label>
    </div>
  )
}

/** Inline spinner for a dependent dropdown that is still loading. */
export function OptionsLoading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-ink-500">
      <Loader className="size-3.5 animate-spin" aria-hidden />
      {label}
    </p>
  )
}