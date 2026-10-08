import { useEffect, type ReactNode } from 'react'
import { FocusContainerContext, useFocusTree, useParentContainer } from './context'
import type { FocusFlow } from './types'

export interface FocusContainerProps {
  id: string
  flow?: FocusFlow
  /** Re-entering the container restores its last focused child. */
  memory?: boolean
  /** Modal scope: while mounted it becomes the only navigable region. */
  scope?: boolean
  /**
   * Register as a focus root instead of nesting under the nearest container.
   * Moves inside a detached scope fail instead of walking out to siblings, so a
   * stick at the scope edge falls back to scrolling the region (spec 13).
   */
  detached?: boolean
  children: ReactNode
}

/**
 * Declares a focus group. It renders no DOM of its own: children keep their
 * layout and register into this container through context.
 */
export function FocusContainer({
  id,
  flow = 'geometric',
  memory,
  scope,
  detached,
  children,
}: FocusContainerProps) {
  const tree = useFocusTree()
  const parentId = useParentContainer()
  const effectiveParent = detached ? null : parentId

  useEffect(() => {
    if (!tree) return
    const unregister = tree.register({
      id,
      parentId: effectiveParent,
      container: true,
      flow,
      memory,
      scope,
    })
    if (scope) tree.pushScope(id)
    return () => {
      if (scope) tree.popScope()
      unregister()
    }
  }, [tree, id, effectiveParent, flow, memory, scope])

  return <FocusContainerContext.Provider value={id}>{children}</FocusContainerContext.Provider>
}
