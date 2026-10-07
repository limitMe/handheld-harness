/**
 * Analog scroll for the sticks (spec 10/13). Unlike the D-pad, the stick scrolls
 * the focused scroll region continuously while held, at a configurable speed.
 */

import type { FocusTree } from './tree'

/** Pixels per second at speed 1.0. */
export const SCROLL_PIXELS_PER_SECOND = 180
export const MIN_SCROLL_SPEED = 0.25
export const MAX_SCROLL_SPEED = 2
/** Upper bound on a frame's delta, so a long stall does not jump the list. */
const MAX_FRAME_SECONDS = 0.05

export function scrollPixelsPerSecond(speed: number): number {
  const clamped = Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, speed))
  return SCROLL_PIXELS_PER_SECOND * clamped
}

/**
 * Finds the nearest marked scroll region from a focused element; falls back to
 * the first region on screen so the stick still scrolls the transcript while
 * the composer (outside the list) is focused.
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

export interface ScrollController {
  /** Current stick deflection, `-1`..`1`; `0` stops the loop. */
  setValue(value: number): void
  dispose(): void
}

export interface ScrollScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

const defaultScheduler: ScrollScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

/**
 * Scrolls the focused region every frame while the stick is deflected. The
 * speed is read per frame, so a settings change applies without a restart.
 */
export function createScrollController(
  tree: FocusTree,
  getSpeed: () => number,
  now: () => number = () => performance.now(),
  scheduler: ScrollScheduler = defaultScheduler,
): ScrollController {
  let value = 0
  let frame: number | null = null
  let last = now()

  const tick = (): void => {
    const current = now()
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (current - last) / 1000))
    last = current
    const focusedId = tree.getFocusedId()
    const region = resolveScrollRegion(focusedId ? tree.getElement(focusedId) : null)
    if (region) scrollRegionBy(region, value * scrollPixelsPerSecond(getSpeed()) * dt)
    frame = scheduler.request(tick)
  }

  const start = (): void => {
    if (frame !== null) return
    last = now()
    frame = scheduler.request(tick)
  }

  const stop = (): void => {
    if (frame === null) return
    scheduler.cancel(frame)
    frame = null
  }

  return {
    setValue(next) {
      value = next
      if (next === 0) stop()
      else start()
    },
    dispose() {
      stop()
    },
  }
}
