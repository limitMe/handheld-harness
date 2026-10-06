// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { FocusTree } from '../../src/renderer/src/focus/tree'
import {
  resolveScrollRegion,
  runScroll,
  scrollRegionBy,
  SCROLL_STEP,
} from '../../src/renderer/src/focus/scroll'

afterEach(() => {
  document.body.innerHTML = ''
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
    scrollRegionBy(region, SCROLL_STEP)
    expect(region.scrollTop).toBe(100 + SCROLL_STEP)
    scrollRegionBy(region, 0)
    expect(region.scrollTop).toBe(100 + SCROLL_STEP)
  })
})

describe('runScroll', () => {
  it('moves focus when there is a neighbor, so the highlight follows', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'a', parentId: 'root' })
    tree.register({ id: 'b', parentId: 'root' })

    tree.setFocus('a')
    runScroll(tree, 1)
    expect(tree.getFocusedId()).toBe('b')

    runScroll(tree, -1)
    expect(tree.getFocusedId()).toBe('a')
  })

  it('scrolls the region when focus cannot move', () => {
    document.body.innerHTML =
      '<div data-scroll-region id="list"><div id="last" tabindex="0"></div></div>'
    const region = document.getElementById('list')
    const last = document.getElementById('last')
    if (!region || !last) throw new Error('fixture missing')

    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'last', parentId: 'root', getElement: () => last })
    tree.setFocus('last')

    runScroll(tree, 1)
    expect(region.scrollTop).toBe(SCROLL_STEP)
    expect(tree.getFocusedId()).toBe('last')
  })
})
