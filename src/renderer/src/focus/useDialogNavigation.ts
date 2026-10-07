import { useMemo } from 'react'
import { CONTEXT_ORDER, onPress, useInputContext } from '../input'
import { useFocusTree } from './context'

/**
 * Registers the `dialog` context while mounted and routes navigation into the
 * focus tree. Modal dialogs then respond to the D-pad and both sticks alike,
 * no matter which screen or overlay is beneath them (spec 11).
 */
export function useDialogNavigation(): void {
  const tree = useFocusTree()
  useInputContext(
    'dialog',
    useMemo(
      () => ({
        'nav.up': onPress(() => tree?.move('up')),
        'nav.down': onPress(() => tree?.move('down')),
        'nav.left': onPress(() => tree?.move('left')),
        'nav.right': onPress(() => tree?.move('right')),
        'nav.activate': onPress(() => tree?.activate()),
        'nav.deactivate': onPress(() => tree?.cancel()),
      }),
      [tree],
    ),
    CONTEXT_ORDER.modal,
  )
}
