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
  children,
}: FocusContainerProps) {
  const tree = useFocusTree()
  const parentId = useParentContainer()

  useEffect(() => {
    if (!tree) return
    const unregister = tree.register({
      id,
      parentId,
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
  }, [tree, id, parentId, flow, memory, scope])

  return <FocusContainerContext.Provider value={id}>{children}</FocusContainerContext.Provider>
}
