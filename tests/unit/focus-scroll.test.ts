// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { FocusTree } from '../../src/renderer/src/focus/tree'
import {
  createScrollController,
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

describe('scrollPixelsPerSecond', () => {
  it('scales with the speed and clamps to the supported range', () => {
    expect(scrollPixelsPerSecond(1)).toBe(SCROLL_PIXELS_PER_SECOND)
    expect(scrollPixelsPerSecond(MAX_SCROLL_SPEED)).toBe(
      SCROLL_PIXELS_PER_SECOND * MAX_SCROLL_SPEED,
    )
    expect(scrollPixelsPerSecond(5)).toBe(SCROLL_PIXELS_PER_SECOND * MAX_SCROLL_SPEED)
    expect(scrollPixelsPerSecond(0)).toBe(SCROLL_PIXELS_PER_SECOND * MIN_SCROLL_SPEED)
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
    '<div data-scroll-region id="list"><div id="item" tabindex="0"></div></div>'
  const region = document.getElementById('list')
  const item = document.getElementById('item')
  if (!region || !item) throw new Error('fixture missing')

  const tree = new FocusTree()
  tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
  tree.register({ id: 'item', parentId: 'root', getElement: () => item })
  tree.setFocus('item')

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
  const controller = createScrollController(tree, getSpeed, () => nowMs, scheduler)
  const advance = (ms: number): void => {
    nowMs += ms
    const entry = pending.entries().next().value
    if (!entry) throw new Error('no pending frame')
    pending.delete(entry[0])
    entry[1](nowMs)
  }
  return { controller, region, advance, pending }
}

describe('createScrollController', () => {
  it('scrolls every frame while the stick is deflected', () => {
    const { controller, region, advance } = makeHarness(() => 1)

    controller.setValue(1)
    advance(50)
    // 50 ms at the base pixels-per-second.
    expect(region.scrollTop).toBeCloseTo(SCROLL_PIXELS_PER_SECOND * 0.05)

    advance(50)
    expect(region.scrollTop).toBeCloseTo(SCROLL_PIXELS_PER_SECOND * 0.1)

    controller.dispose()
  })

  it('clamps a long frame so a stall does not jump the list', () => {
    const { controller, region, advance } = makeHarness(() => 1)

    controller.setValue(1)
    advance(2000)
    expect(region.scrollTop).toBeCloseTo(SCROLL_PIXELS_PER_SECOND * 0.05)

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

  it('reads the speed per frame so a settings change applies live', () => {
    let speed = 1
    const { controller, region, advance } = makeHarness(() => speed)

    controller.setValue(1)
    advance(50)
    const first = region.scrollTop

    speed = 2
    advance(50)
    expect(region.scrollTop - first).toBeCloseTo(first * 2)

    controller.dispose()
  })
})
