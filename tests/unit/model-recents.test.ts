import { describe, expect, it } from 'vitest'
import type { ModelRef } from '../../src/shared/engine'
import {
  modelKey,
  ringSlots,
  RING_SLOTS,
  sameModelRef,
  touchRecentModel,
  type RecentModel,
} from '../../src/shared/model-recents'

function model(id: string): ModelRef {
  return { providerId: 'fake', modelId: id }
}

function keys(recent: RecentModel[]): string[] {
  return recent.map((entry) => entry.model.modelId)
}

function slots(recent: RecentModel[]): number[] {
  return recent.map((entry) => entry.slot)
}

describe('model refs', () => {
  it('keys and compares by provider and model', () => {
    expect(modelKey(model('m1'))).toBe('fake/m1')
    expect(sameModelRef(model('m1'), model('m1'))).toBe(true)
    expect(sameModelRef(model('m1'), model('m2'))).toBe(false)
    expect(sameModelRef(null, null)).toBe(true)
    expect(sameModelRef(model('m1'), null)).toBe(false)
  })
})

describe('touchRecentModel', () => {
  it('assigns the first free slots from the top, clockwise', () => {
    let recent: RecentModel[] = []
    recent = touchRecentModel(recent, model('a'))
    recent = touchRecentModel(recent, model('b'))
    recent = touchRecentModel(recent, model('c'))

    // Most recent first, each keeping the slot it was first given.
    expect(keys(recent)).toEqual(['c', 'b', 'a'])
    expect(slots(recent)).toEqual([2, 1, 0])
  })

  it('keeps the slot of a model that is used again', () => {
    let recent: RecentModel[] = []
    for (const id of ['a', 'b', 'c', 'd']) recent = touchRecentModel(recent, model(id))

    recent = touchRecentModel(recent, model('b'))

    expect(keys(recent)).toEqual(['b', 'd', 'c', 'a'])
    expect(slots(recent)).toEqual([1, 3, 2, 0])
  })

  it('reuses the least-recent slot once the ring is full', () => {
    let recent: RecentModel[] = []
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) recent = touchRecentModel(recent, model(id))
    expect(keys(recent)).toEqual(['f', 'e', 'd', 'c', 'b', 'a'])
    expect(slots(recent)).toEqual([5, 4, 3, 2, 1, 0])

    // The newcomer replaces the 7th most recent (the oldest, slot 0).
    recent = touchRecentModel(recent, model('g'))
    expect(keys(recent)).toEqual(['g', 'f', 'e', 'd', 'c', 'b'])
    expect(slots(recent)).toEqual([0, 5, 4, 3, 2, 1])

    // Next eviction takes the now-oldest (b, slot 1).
    recent = touchRecentModel(recent, model('h'))
    expect(keys(recent)).toEqual(['h', 'g', 'f', 'e', 'd', 'c'])
    expect(slots(recent)).toEqual([1, 0, 5, 4, 3, 2])
  })

  it('refreshes the stored display name but keeps the slot', () => {
    let recent = touchRecentModel([], model('a'), 'Old name')
    recent = touchRecentModel(recent, model('a'), 'New name')

    expect(recent).toEqual([{ model: model('a'), slot: 0, name: 'New name' }])
  })

  it('never exceeds the ring size', () => {
    let recent: RecentModel[] = []
    for (let index = 0; index < 20; index += 1) recent = touchRecentModel(recent, model(`m${index}`))
    expect(recent).toHaveLength(RING_SLOTS)
    expect(new Set(slots(recent)).size).toBe(RING_SLOTS)
  })
})

describe('ringSlots', () => {
  it('places entries by slot and leaves the rest null', () => {
    const recent: RecentModel[] = [
      { model: model('c'), slot: 2 },
      { model: model('a'), slot: 0 },
    ]

    const slots = ringSlots(recent)
    expect(slots).toHaveLength(RING_SLOTS)
    expect(slots[0]?.model.modelId).toBe('a')
    expect(slots[1]).toBeNull()
    expect(slots[2]?.model.modelId).toBe('c')
    expect(slots.slice(3)).toEqual([null, null, null])
  })
})
