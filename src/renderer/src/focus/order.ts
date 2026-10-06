/**
 * Explicit sibling order for the 03 screens. The composer mounts before any
 * message arrives, so registration order alone would put it above the
 * transcript; these bands keep visual order (tasks ▸ transcript ▸ cards ▸
 * composer) regardless of mount timing.
 */
export const FOCUS_ORDER = {
  screen: 0,
  messages: 1_000,
  messageStride: 100,
  scrollLatest: 900_000,
  cards: 1_000_000,
  composer: 2_000_000,
} as const

export function messageOrder(index: number): number {
  return FOCUS_ORDER.messages + index * FOCUS_ORDER.messageStride
}
