/** Vertical scroll for the analog `scroll` action (right stick, spec 10/13). */

import type { FocusTree } from './tree'

export const SCROLL_STEP = 24

/**
 * Finds the nearest marked scroll region from a focused element; falls back to
 * the first region on screen so the right stick still scrolls the transcript
 * while the composer (outside the list) is focused.
 */
export function resolveScrollRegion(from: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = from
  while (node) {
    if (node.hasAttribute('data-scroll-region')) return node
    node = node.parentElement
  }
  return document.querySelector<HTMLElement>('[data-scroll-region]')
}

export function scrollRegionBy(region: HTMLElement, delta: number): void {
  if (delta === 0) return
  region.scrollTop += delta
}

/**
 * Right-stick handling. Moving the focus node keeps the highlight in sync with
 * the scroll (and scrolls via `scrollIntoView`); when there is nowhere to move
 * (e.g. the composer at the bottom, or the end of a list) the nearest scroll
 * region scrolls directly instead.
 */
export function runScroll(tree: FocusTree, value: number): void {
  if (value === 0) return
  const direction = value > 0 ? 'down' : 'up'
  if (tree.move(direction)) return
  const focused = tree.getFocusedId()
  const region = resolveScrollRegion(focused ? tree.getElement(focused) : null)
  if (region) scrollRegionBy(region, value * SCROLL_STEP)
}
