import { RING_SLOTS } from '@shared/model-recents'

/**
 * Model-ring geometry and stick mapping (spec 14). Pure so the angle maths can be
 * unit-tested; the drawing lives in `ModelRing`.
 */

/** Stick deflection required before a direction selects a sector. */
export const RING_STICK_THRESHOLD = 0.5

/**
 * Maps a stick vector onto a ring slot: 0 is the top sector, `RING_SLOTS` are
 * laid out clockwise by an even angle. Returns null inside the deadzone, so a
 * resting stick never changes the selection.
 */
export function ringSlotFromStick(x: number, y: number): number | null {
  if (Math.hypot(x, y) < RING_STICK_THRESHOLD) return null
  const step = 360 / RING_SLOTS
  // Gamepad Y points down, so `-y` reads "up" as 0° and angles grow clockwise.
  const degrees = (Math.atan2(x, -y) * 180) / Math.PI
  const normalized = (degrees + 360) % 360
  return Math.floor(((normalized + step / 2) % 360) / step)
}

export interface Point {
  x: number
  y: number
}

/** Point on a circle where 0° is the top and angles grow clockwise. */
export function ringPoint(cx: number, cy: number, radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  return { x: cx + radius * Math.sin(radians), y: cy - radius * Math.cos(radians) }
}

/** SVG path for one annular sector of the ring. */
export function sectorPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  startDeg: number,
  endDeg: number,
): string {
  const outerStart = ringPoint(cx, cy, outer, startDeg)
  const outerEnd = ringPoint(cx, cy, outer, endDeg)
  const innerEnd = ringPoint(cx, cy, inner, endDeg)
  const innerStart = ringPoint(cx, cy, inner, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}
