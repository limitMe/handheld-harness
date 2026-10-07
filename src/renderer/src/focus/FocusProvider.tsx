import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Settings } from '@shared/ipc'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { FocusTreeContext } from './context'
import { FocusContainer } from './FocusContainer'
import { createScrollController, type ScrollController } from './scroll'
import { FocusTree } from './tree'

/** Keeps the analog scroll speed in sync with settings (spec 15). */
function useScrollSpeed(): RefObject<number> {
  const speed = useRef(1)
  useEffect(() => {
    const bridge = window.handheld
    if (!bridge) return
    let disposed = false
    const apply = (settings: Settings): void => {
      speed.current = settings.ui.scrollSpeed
    }
    bridge.settings
      .get()
      .then((settings) => {
        if (!disposed) apply(settings)
      })
      .catch(() => undefined)
    const off = bridge.events.on('settings:changed', apply)
    return () => {
      disposed = true
      off()
    }
  }, [])
  return speed
}

/**
 * Routes the semantic navigation actions (spec 10) into the focus tree. It is
 * registered on a low-priority context so an activated component or a modal can
 * shadow it, and it never resolves bindings itself: the screen context does.
 */
function FocusNavigation({ tree, scroll }: { tree: FocusTree; scroll: ScrollController }) {
  useInputContext(
    'focus',
    {
      'nav.up': onPress(() => tree.move('up')),
      'nav.down': onPress(() => tree.move('down')),
      'nav.left': onPress(() => tree.move('left')),
      'nav.right': onPress(() => tree.move('right')),
      'nav.activate': onPress(() => tree.activate()),
      'nav.deactivate': onPress(() => tree.cancel()),
      scroll: (event) => scroll.setValue(event.phase === 'end' ? 0 : (event.value ?? 0)),
    },
    CONTEXT_ORDER.focus,
  )
  return null
}

export function FocusProvider({ children }: { children: ReactNode }) {
  const [tree] = useState(() => new FocusTree())
  const scrollSpeed = useScrollSpeed()
  const [scroll] = useState(() => createScrollController(tree, () => scrollSpeed.current))

  useEffect(() => () => scroll.dispose(), [scroll])

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
      <FocusNavigation tree={tree} scroll={scroll} />
      <FocusContainer id="focus-root" flow="column">
        {children}
      </FocusContainer>
    </FocusTreeContext.Provider>
  )
}
