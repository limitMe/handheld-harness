import { useEffect, useRef } from 'react'
import { useInputApi } from './context'
import type { ActionHandlers } from './router'

/**
 * Pushes a context while the calling component is mounted. Handlers are read
 * through a ref, so they stay fresh without re-registering every render.
 * `order` places the context in the stack (see `CONTEXT_ORDER`); higher orders
 * are consulted first. `enabled: false` keeps the context off the stack (e.g. a
 * card on a screen that a higher overlay has dimmed), so it shadows nothing.
 */
export function useInputContext(
  id: string,
  handlers: ActionHandlers,
  order = 0,
  enabled = true,
): void {
  const api = useInputApi()
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })
  useEffect(() => {
    if (!enabled) return undefined
    return api.pushContext(id, () => ref.current, order)
  }, [api, id, order, enabled])
}
