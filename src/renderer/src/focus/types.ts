/** Focus tree primitives shared by the pure core and the React layer (spec 11). */

export type FocusFlow = 'row' | 'column' | 'grid' | 'geometric'

export type FocusDirection = 'up' | 'down' | 'left' | 'right'

/**
 * Result of routing a direction key into an activated node:
 * - `handled`: the node consumed it (e.g. the text cursor moved);
 * - `exit`: the node asked to leave activation, the key is consumed;
 * - `pass`: leave activation and continue with normal focus navigation.
 */
export type NavigateResult = 'handled' | 'exit' | 'pass'

export interface FocusRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FocusNodeInit {
  id: string
  parentId: string | null
  /**
   * Sort key within a parent. Nodes mount in arbitrary order (the composer
   * mounts before messages arrive), so visual order needs an explicit hint.
   * Lower orders come first; ties fall back to registration order.
   */
  order?: number
  /** Containers group children and are never focus stops themselves. */
  container?: boolean
  flow?: FocusFlow
  memory?: boolean
  /** Modal scope: while mounted it becomes the only navigable region. */
  scope?: boolean
  activatable?: boolean
  disabled?: boolean
  getRect?: () => FocusRect | null
  getElement?: () => HTMLElement | null
  onActivate?: () => void
  onDeactivate?: () => void
  onNavigate?: (direction: FocusDirection) => NavigateResult | void
  onFocus?: () => void
  onBlur?: () => void
  /** Back/cancel on the focused node while it is not activated. */
  onCancel?: () => void
}

export interface FocusState {
  focusedId: string | null
  activatedId: string | null
}

export interface FocusableState {
  focused: boolean
  activated: boolean
  focusWithin: boolean
}

export interface FocusNodeDebug {
  id: string
  parentId: string | null
  container: boolean
  flow: FocusFlow
  memory: boolean
  scope: boolean
  activatable: boolean
  disabled: boolean
  focused: boolean
  activated: boolean
  focusWithin: boolean
  children: string[]
}
