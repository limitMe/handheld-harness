import type { MouseEvent } from 'react'

/**
 * Whether a `mousemove` carries real pointer motion. A browser fires a synthetic
 * zero-movement `mousemove` when scrolling a row under a resting cursor; acting
 * on it would hijack the D-pad/keyboard highlight on highlight-driven lists
 * (spec 13/14).
 */
export function isPointerMoved(event: MouseEvent<HTMLElement>): boolean {
  return event.movementX !== 0 || event.movementY !== 0
}
