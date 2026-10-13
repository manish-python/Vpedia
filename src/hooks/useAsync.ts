import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  isLoading: boolean
  error: string | null
}

/**
 * Runs an async service call and tracks loading/error state.
 *
 * Race conditions are handled with a request id, and unmounted components
 * never set state. `deps` behaves like a `useEffect` dependency list.
 */
export function useAsync<T>(
  task: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
): AsyncState<T> & { refetch: () => void } {
  const enabled = options.enabled ?? true
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: enabled,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const taskRef = useRef(task)
  taskRef.current = task

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, isLoading: false, error: null })
      return
    }

    const controller = new AbortController()
    let active = true

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    taskRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ data, isLoading: false, error: null })
      })
      .catch((cause: unknown) => {
        if (!active) return
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        const message =
          cause instanceof Error ? cause.message : 'Unable to load content. Please retry.'
        setState({ data: null, isLoading: false, error: message })
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { ...state, refetch }
}
