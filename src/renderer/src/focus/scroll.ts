/**
 * Analog stick navigation (spec 10/13). While a stick is deflected it steps the
 * focus one node at a time; when there is nowhere left to move (end of a list)
 * it keeps scrolling the focused region. The speed setting scales both the
 * focus step rate and the scroll rate.
 */

import type { FocusTree } from './tree'

/** Pixels per second at speed 1.0 while scrolling past the end of a list. */
export const SCROLL_PIXELS_PER_SECOND = 180
/** Milliseconds between focus steps at speed 1.0. */
export const BASE_FOCUS_INTERVAL_MS = 280
/** A continuous hold accelerates after this long (spec 10). */
export const ACCELERATE_AFTER_MS = 1000
export const MAX_ACCELERATION = 3
export const MIN_SCROLL_SPEED = 0.25
export const MAX_SCROLL_SPEED = 2
/** Upper bound on a frame's delta, so a long stall does not jump the list. */
const MAX_FRAME_SECONDS = 0.05

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, speed))
}

export function scrollPixelsPerSecond(speed: number): number {
  return SCROLL_PIXELS_PER_SECOND * clampSpeed(speed)
}

export function focusIntervalMs(speed: number, acceleration = 1): number {
  return BASE_FOCUS_INTERVAL_MS / (clampSpeed(speed) * acceleration)
}

/**
 * Hold acceleration: 1x for the first second, then +1x each further second, up
 * to `MAX_ACCELERATION`. Reversing direction restarts the hold.
 */
export function accelerationFor(heldMs: number): number {
  if (heldMs < ACCELERATE_AFTER_MS) return 1
  return Math.min(MAX_ACCELERATION, 1 + Math.floor(heldMs / ACCELERATE_AFTER_MS))
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

export interface StickController {
  /** Current stick deflection, `-1`..`1`; `0` stops the loop. */
  setValue(value: number): void
  dispose(): void
}

export interface StickScheduler {
  request(callback: FrameRequestCallback): number
  cancel(handle: number): void
}

const defaultScheduler: StickScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

/**
 * Steps focus (or scrolls at the ends) every frame while the stick is deflected.
 * The speed is read per frame, so a settings change applies without a restart.
 */
export function createStickController(
  tree: FocusTree,
  getSpeed: () => number,
  now: () => number = () => performance.now(),
  scheduler: StickScheduler = defaultScheduler,
): StickController {
  let value = 0
  let sign = 0
  let frame: number | null = null
  let last = now()
  let heldSince = now()
  let nextMoveAt = 0
  let atBoundary = false

  const tick = (): void => {
    const current = now()
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (current - last) / 1000))
    last = current
    if (value !== 0) {
      const speed = getSpeed()
      const acceleration = accelerationFor(current - heldSince)
      const direction = value > 0 ? 'down' : 'up'
      if (current >= nextMoveAt) {
        nextMoveAt = current + focusIntervalMs(speed, acceleration)
        atBoundary = !tree.move(direction)
      }
      if (atBoundary) {
        const focusedId = tree.getFocusedId()
        const region = resolveScrollRegion(focusedId ? tree.getElement(focusedId) : null)
        if (region) {
          scrollRegionBy(region, value * scrollPixelsPerSecond(speed) * acceleration * dt)
        }
      }
    }
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
      if (next === 0) {
        value = 0
        sign = 0
        atBoundary = false
        stop()
        return
      }
      const nextSign = next > 0 ? 1 : -1
      if (nextSign !== sign || frame === null) {
        // Fresh deflection or reversed direction: step focus on the next frame.
        nextMoveAt = 0
        atBoundary = false
        sign = nextSign
        heldSince = now()
      }
      value = next
      start()
    },
    dispose() {
      stop()
    },
  }
}
