import { useEffect, useRef } from 'react'
import { useInputApi } from './context'
import type { ActionHandlers } from './router'

/**
 * Pushes a context while the calling component is mounted. Handlers are read
 * through a ref, so they stay fresh without re-registering every render.
 */
export function useInputContext(id: string, handlers: ActionHandlers): void {
  const api = useInputApi()
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })
  useEffect(() => api.pushContext(id, () => ref.current), [api, id])
}
