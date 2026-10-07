// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { FocusTree } from '../../src/renderer/src/focus/tree'
import {
  ACCELERATE_AFTER_MS,
  accelerationFor,
  createStickController,
  focusIntervalMs,
  MAX_ACCELERATION,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  resolveScrollRegion,
  SCROLL_PIXELS_PER_SECOND,
  scrollPixelsPerSecond,
  scrollRegionBy,
} from '../../src/renderer/src/focus/scroll'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('scrollPixelsPerSecond / focusIntervalMs', () => {
  it('scale with the speed and clamp to the supported range', () => {
    expect(scrollPixelsPerSecond(1)).toBe(SCROLL_PIXELS_PER_SECOND)
    expect(scrollPixelsPerSecond(5)).toBe(SCROLL_PIXELS_PER_SECOND * MAX_SCROLL_SPEED)
    expect(scrollPixelsPerSecond(0)).toBe(SCROLL_PIXELS_PER_SECOND * MIN_SCROLL_SPEED)

    expect(focusIntervalMs(1)).toBeGreaterThan(focusIntervalMs(2))
    expect(focusIntervalMs(0)).toBeGreaterThan(focusIntervalMs(1))
  })
})

describe('accelerationFor', () => {
  it('stays 1x for the first second then steps up, capped', () => {
    expect(accelerationFor(0)).toBe(1)
    expect(accelerationFor(ACCELERATE_AFTER_MS - 1)).toBe(1)
    expect(accelerationFor(ACCELERATE_AFTER_MS)).toBe(2)
    expect(accelerationFor(ACCELERATE_AFTER_MS * 2)).toBe(3)
    expect(accelerationFor(ACCELERATE_AFTER_MS * 10)).toBe(MAX_ACCELERATION)
  })
})

describe('resolveScrollRegion', () => {
  it('finds the nearest marked region from a focused element', () => {
    document.body.innerHTML =
      '<div data-scroll-region id="list"><button id="item"></button></div>'
    const item = document.getElementById('item')
    expect(resolveScrollRegion(item)?.id).toBe('list')
  })

  it('falls back to the first region when focus is outside', () => {
    document.body.innerHTML = '<div data-scroll-region id="list"></div><div id="outside"></div>'
    expect(resolveScrollRegion(document.getElementById('outside'))?.id).toBe('list')
    expect(resolveScrollRegion(null)?.id).toBe('list')
    expect(resolveScrollRegion(document.createElement('div'))?.id).toBe('list')
  })

  it('returns null when nothing is marked', () => {
    document.body.innerHTML = '<div id="nothing"></div>'
    expect(resolveScrollRegion(document.getElementById('nothing'))).toBeNull()
  })
})

describe('scrollRegionBy', () => {
  it('moves scrollTop by the delta and ignores zero', () => {
    const region = document.createElement('div')
    region.scrollTop = 100
    scrollRegionBy(region, 40)
    expect(region.scrollTop).toBe(140)
    scrollRegionBy(region, 0)
    expect(region.scrollTop).toBe(140)
  })
})

function makeHarness(getSpeed: () => number) {
  document.body.innerHTML =
    '<div data-scroll-region id="list">' +
    '<div id="a" tabindex="0"></div><div id="b" tabindex="0"></div><div id="c" tabindex="0"></div>' +
    '</div>'
  const region = document.getElementById('list')
  if (!region) throw new Error('fixture missing')
  const element = (id: string) => document.getElementById(id)

  const tree = new FocusTree()
  tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
  for (const id of ['a', 'b', 'c']) {
    tree.register({ id, parentId: 'root', getElement: () => element(id) })
  }
  tree.setFocus('a')

  let nowMs = 0
  let nextHandle = 0
  const pending = new Map<number, FrameRequestCallback>()
  const scheduler = {
    request: (callback: FrameRequestCallback): number => {
      nextHandle += 1
      pending.set(nextHandle, callback)
      return nextHandle
    },
    cancel: (handle: number): void => {
      pending.delete(handle)
    },
  }
  const controller = createStickController(tree, getSpeed, () => nowMs, scheduler)
  const advance = (ms: number): void => {
    nowMs += ms
    const entry = pending.entries().next().value
    if (!entry) throw new Error('no pending frame')
    pending.delete(entry[0])
    entry[1](nowMs)
  }
  return { controller, region, tree, advance, pending }
}

describe('createStickController', () => {
  it('steps focus one node at a time while there is a neighbor', () => {
    const { controller, tree, advance } = makeHarness(() => 1)

    controller.setValue(1)
    advance(0)
    expect(tree.getFocusedId()).toBe('b')

    advance(focusIntervalMs(1))
    expect(tree.getFocusedId()).toBe('c')

    controller.dispose()
  })

  it('scrolls the region once focus reaches the end', () => {
    const { controller, region, tree, advance } = makeHarness(() => 1)
    tree.setFocus('c')

    controller.setValue(1)
    advance(0)
    expect(tree.getFocusedId()).toBe('c')
    expect(region.scrollTop).toBe(0)

    advance(50)
    expect(region.scrollTop).toBeCloseTo(SCROLL_PIXELS_PER_SECOND * 0.05)

    controller.dispose()
  })

  it('doubles the scroll rate after a second of holding the same direction', () => {
    const { controller, region, tree, advance } = makeHarness(() => 1)
    tree.setFocus('c')

    controller.setValue(1)
    advance(0)
    advance(50)
    const first = region.scrollTop
    expect(first).toBeCloseTo(SCROLL_PIXELS_PER_SECOND * 0.05)

    advance(950)
    expect(region.scrollTop - first).toBeCloseTo(first * 2)

    controller.dispose()
  })

  it('resets the acceleration when the direction changes', () => {
    const { controller, tree, advance } = makeHarness(() => 1)
    tree.setFocus('c')

    controller.setValue(1)
    advance(0)
    advance(1000)

    controller.setValue(-1)
    advance(0)
    expect(tree.getFocusedId()).toBe('b')

    controller.dispose()
  })

  it('returns to stepping focus when the stick is reversed', () => {
    const { controller, tree, advance } = makeHarness(() => 1)
    tree.setFocus('c')

    controller.setValue(1)
    advance(0)
    advance(50)

    controller.setValue(-1)
    advance(0)
    expect(tree.getFocusedId()).toBe('b')

    controller.dispose()
  })

  it('stops scheduling frames when the stick returns to center', () => {
    const { controller, pending } = makeHarness(() => 1)

    controller.setValue(1)
    expect(pending.size).toBe(1)

    controller.setValue(0)
    expect(pending.size).toBe(0)

    controller.dispose()
  })
})
