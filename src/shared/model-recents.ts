import type { ModelRef } from './engine'

/**
 * Recent-model ring helpers (spec 14, model picker). The settings store keeps a
 * list of recently used models, ordered most-recent-first. Each entry also
 * remembers the slot it was assigned on the six-sector ring, so using a model
 * again never reshuffles the ring: only the recency order changes.
 */

/** Sectors in the model ring: 0 is the top one, increasing clockwise. */
export const RING_SLOTS = 6

export interface RecentModel {
  model: ModelRef
  /** Ring slot (0..5) remembered from when the model first joined the ring. */
  slot: number
  /** Display name captured when the model was chosen; falls back to the id. */
  name?: string
}

export function modelKey(model: ModelRef): string {
  return `${model.providerId}/${model.modelId}`
}

export function sameModelRef(
  a: ModelRef | null | undefined,
  b: ModelRef | null | undefined,
): boolean {
  if (!a || !b) return !a && !b
  return a.providerId === b.providerId && a.modelId === b.modelId
}

/**
 * Moves `model` to the front of the recent list and gives it a ring slot:
 * - an existing entry keeps the slot it already has;
 * - otherwise the lowest free slot (top first, clockwise) is used;
 * - when every slot is taken, the slot of the least-recent entry (the 7th most
 *   recent one once the newcomer is inserted) is reused and that entry drops off.
 */
export function touchRecentModel(
  recent: RecentModel[],
  model: ModelRef,
  name?: string,
): RecentModel[] {
  const key = modelKey(model)
  const existing = recent.find((entry) => modelKey(entry.model) === key)
  const rest = recent.filter((entry) => modelKey(entry.model) !== key)

  let slot: number
  if (existing) {
    slot = existing.slot
  } else {
    const used = new Set(rest.map((entry) => entry.slot))
    let free = -1
    for (let index = 0; index < RING_SLOTS; index += 1) {
      if (!used.has(index)) {
        free = index
        break
      }
    }
    slot = free >= 0 ? free : (rest[RING_SLOTS - 1]?.slot ?? 0)
  }

  const resolvedName = name ?? existing?.name
  const entry: RecentModel =
    resolvedName === undefined ? { model, slot } : { model, slot, name: resolvedName }
  return [entry, ...rest].slice(0, RING_SLOTS)
}

/** Recent entries placed by slot; unassigned slots are `null`. */
export function ringSlots(recent: RecentModel[]): Array<RecentModel | null> {
  const slots: Array<RecentModel | null> = Array.from({ length: RING_SLOTS }, () => null)
  for (const entry of recent) {
    if (entry.slot >= 0 && entry.slot < RING_SLOTS && slots[entry.slot] === null) {
      slots[entry.slot] = entry
    }
  }
  return slots
}
