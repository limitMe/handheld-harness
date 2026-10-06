import { useCallback, useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { FocusContainerContext, useFocusTree } from './context'
import type { FocusDirection, FocusableState, NavigateResult } from './types'

export interface UseFocusableOptions {
  id: string
  /** The element the node is attached to; owned by the caller so no ref is returned. */
  elementRef: RefObject<HTMLElement | null>
  /** Sort key among siblings; see `FOCUS_ORDER`. */
  order?: number
  activatable?: boolean
  disabled?: boolean
  onActivate?: () => void
  onDeactivate?: () => void
  onNavigate?: (direction: FocusDirection) => NavigateResult | void
  onFocus?: () => void
  onBlur?: () => void
  onCancel?: () => void
}

export interface FocusableElementProps {
  'data-focus-id': string
  tabIndex: number
  'data-focused'?: string
  'data-activated'?: string
  'data-focus-within'?: string
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void
}

export interface FocusableControls extends FocusableState {
  props: FocusableElementProps
}

const IDLE: FocusableState = { focused: false, activated: false, focusWithin: false }

/**
 * Registers an element as a focus-tree node and returns the data attributes and
 * handlers to spread onto it. Keeping this as a hook (instead of a wrapper
 * component) lets existing elements stay in place, so layouts do not shift.
 */
export function useFocusable(options: UseFocusableOptions): FocusableControls {
  const tree = useFocusTree()
  const parentId = useContext(FocusContainerContext)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const [state, setState] = useState<FocusableState>(IDLE)

  const { id, elementRef, order, activatable, disabled } = options

  useEffect(() => {
    if (!tree) return
    const unregister = tree.register({
      id,
      parentId,
      order,
      container: false,
      ...(activatable !== undefined ? { activatable } : {}),
      ...(disabled !== undefined ? { disabled } : {}),
      getElement: () => elementRef.current,
      getRect: () => {
        const element = elementRef.current
        if (!element || typeof element.getBoundingClientRect !== 'function') return null
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      },
      onActivate: () => optionsRef.current.onActivate?.(),
      onDeactivate: () => optionsRef.current.onDeactivate?.(),
      onNavigate: (direction) => optionsRef.current.onNavigate?.(direction),
      onFocus: () => optionsRef.current.onFocus?.(),
      onBlur: () => optionsRef.current.onBlur?.(),
      onCancel: () => optionsRef.current.onCancel?.(),
    })

    const update = (): void => {
      const next = tree.stateFor(id)
      setState((previous) =>
        previous.focused === next.focused &&
        previous.activated === next.activated &&
        previous.focusWithin === next.focusWithin
          ? previous
          : next,
      )
    }
    update()
    const off = tree.subscribe(update)
    return () => {
      off()
      unregister()
    }
  }, [tree, parentId, id, elementRef, order, activatable, disabled])

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null
      const owner = target?.closest?.('[data-focus-id]')
      if (owner && owner.getAttribute('data-focus-id') !== id) return
      tree?.setFocus(id)
    },
    [tree, id],
  )

  const props: FocusableElementProps = {
    'data-focus-id': id,
    tabIndex: disabled ? -1 : 0,
    onFocus: handleFocus,
  }
  if (state.focused) props['data-focused'] = ''
  if (state.activated) props['data-activated'] = ''
  if (state.focusWithin) props['data-focus-within'] = ''

  return { ...state, props }
}
