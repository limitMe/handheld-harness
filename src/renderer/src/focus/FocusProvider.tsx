import { useEffect, useState, type ReactNode } from 'react'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { FocusTreeContext } from './context'
import { FocusContainer } from './FocusContainer'
import { runScroll } from './scroll'
import { FocusTree } from './tree'

/**
 * Routes the semantic navigation actions (spec 10) into the focus tree. It is
 * registered on a low-priority context so an activated component or a modal can
 * shadow it, and it never resolves bindings itself: the screen context does.
 */
function FocusNavigation({ tree }: { tree: FocusTree }) {
  useInputContext(
    'focus',
    {
      'nav.up': onPress(() => tree.move('up')),
      'nav.down': onPress(() => tree.move('down')),
      'nav.left': onPress(() => tree.move('left')),
      'nav.right': onPress(() => tree.move('right')),
      'nav.activate': onPress(() => tree.activate()),
      'nav.deactivate': onPress(() => tree.cancel()),
      scroll: onPress((event) => runScroll(tree, event.value ?? 0)),
    },
    CONTEXT_ORDER.focus,
  )
  return null
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [tree] = useState(() => new FocusTree())

  useEffect(() => {
    let lastFocused: string | null = null
    const off = tree.subscribe(() => {
      const id = tree.getFocusedId()
      if (id !== lastFocused) {
        lastFocused = id
        if (id) {
          const element = tree.getElement(id)
          const active = document.activeElement
          if (element && active !== element && !element.contains(active)) {
            element.focus({ preventScroll: true })
          }
        }
      }
      if (id) tree.getElement(id)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    })
    return off
  }, [tree])

  return (
    <FocusTreeContext.Provider value={tree}>
      <FocusNavigation tree={tree} />
      <FocusContainer id="focus-root" flow="column">
        {children}
      </FocusContainer>
    </FocusTreeContext.Provider>
  )
}
