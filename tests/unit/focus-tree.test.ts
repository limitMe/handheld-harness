import { describe, expect, it, vi } from 'vitest'
import { FocusTree } from '../../src/renderer/src/focus/tree'
import type { FocusRect } from '../../src/renderer/src/focus/types'

function rect(x: number, y: number): FocusRect {
  return { x, y, width: 10, height: 10 }
}

describe('FocusTree ordered navigation', () => {
  it('moves along a row and stops at the edges', () => {
    const tree = new FocusTree()
    tree.register({ id: 'row', parentId: null, container: true, flow: 'row' })
    for (const id of ['a', 'b', 'c']) tree.register({ id, parentId: 'row' })

    expect(tree.getFocusedId()).toBe('a')
    expect(tree.move('right')).toBe(true)
    expect(tree.getFocusedId()).toBe('b')
    expect(tree.move('right')).toBe(true)
    expect(tree.getFocusedId()).toBe('c')
    expect(tree.move('right')).toBe(false)
    expect(tree.getFocusedId()).toBe('c')
    expect(tree.move('left')).toBe(true)
    expect(tree.getFocusedId()).toBe('b')
  })

  it('walks up to the parent container at a boundary', () => {
    const tree = new FocusTree()
    tree.register({ id: 'column', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'top', parentId: 'column', container: true, flow: 'row' })
    tree.register({ id: 'bottom', parentId: 'column', container: true, flow: 'row' })
    for (const id of ['t1', 't2']) tree.register({ id, parentId: 'top' })
    for (const id of ['b1', 'b2']) tree.register({ id, parentId: 'bottom' })

    expect(tree.getFocusedId()).toBe('t1')
    expect(tree.move('down')).toBe(true)
    expect(tree.getFocusedId()).toBe('b1')
    expect(tree.move('up')).toBe(true)
    expect(tree.getFocusedId()).toBe('t1')
  })

  it('navigates a grid by geometry', () => {
    const tree = new FocusTree()
    tree.register({ id: 'grid', parentId: null, container: true, flow: 'grid' })
    tree.register({ id: 'a', parentId: 'grid', getRect: () => rect(0, 0) })
    tree.register({ id: 'b', parentId: 'grid', getRect: () => rect(20, 0) })
    tree.register({ id: 'c', parentId: 'grid', getRect: () => rect(0, 20) })
    tree.register({ id: 'd', parentId: 'grid', getRect: () => rect(20, 20) })

    expect(tree.getFocusedId()).toBe('a')
    expect(tree.move('right')).toBe(true)
    expect(tree.getFocusedId()).toBe('b')
    expect(tree.move('down')).toBe(true)
    expect(tree.getFocusedId()).toBe('d')
    expect(tree.move('left')).toBe(true)
    expect(tree.getFocusedId()).toBe('c')
  })

  it('skips disabled nodes', () => {
    const tree = new FocusTree()
    tree.register({ id: 'row', parentId: null, container: true, flow: 'row' })
    tree.register({ id: 'a', parentId: 'row' })
    tree.register({ id: 'b', parentId: 'row', disabled: true })
    tree.register({ id: 'c', parentId: 'row' })

    expect(tree.move('right')).toBe(true)
    expect(tree.getFocusedId()).toBe('c')
  })

  it('orders siblings by explicit order instead of registration order', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    // The composer mounts first but must stay last; a message part mounts later.
    tree.register({ id: 'composer', parentId: 'root', order: 200 })
    tree.register({ id: 'part', parentId: 'root', order: 100 })

    tree.setFocus('composer')
    expect(tree.move('up')).toBe(true)
    expect(tree.getFocusedId()).toBe('part')

    // Re-registering with a new order moves the node.
    tree.register({ id: 'part', parentId: 'root', order: 300 })
    tree.setFocus('composer')
    expect(tree.move('down')).toBe(true)
    expect(tree.getFocusedId()).toBe('part')
  })
})

describe('FocusTree memory', () => {
  it('restores the last focused child of a memory container', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'listA', parentId: 'root', container: true, flow: 'column', memory: true })
    tree.register({ id: 'listB', parentId: 'root', container: true, flow: 'column' })
    for (const id of ['a1', 'a2']) tree.register({ id, parentId: 'listA' })
    for (const id of ['b1', 'b2']) tree.register({ id, parentId: 'listB' })

    expect(tree.getFocusedId()).toBe('a1')
    expect(tree.move('down')).toBe(true)
    expect(tree.getFocusedId()).toBe('a2')
    expect(tree.move('down')).toBe(true)
    expect(tree.getFocusedId()).toBe('b1')
    expect(tree.move('up')).toBe(true)
    expect(tree.getFocusedId()).toBe('a2')
  })
})

describe('FocusTree unmount transfer', () => {
  it('moves focus to a sibling when the focused node unmounts', () => {
    const tree = new FocusTree()
    tree.register({ id: 'list', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'a', parentId: 'list' })
    tree.register({ id: 'b', parentId: 'list' })

    tree.setFocus('b')
    tree.unregister('b')
    expect(tree.getFocusedId()).toBe('a')
  })

  it('moves focus out of a container when it unmounts', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'keep', parentId: 'root' })
    const release = tree.register({ id: 'gone', parentId: 'root' })

    tree.setFocus('gone')
    release()
    expect(tree.getFocusedId()).toBe('keep')
  })

  it('prefers a neighbor over the first root node after unmount', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'first', parentId: 'root', order: 0 })
    tree.register({ id: 'middle', parentId: 'root', order: 100 })
    tree.register({ id: 'last', parentId: 'root', order: 200 })

    tree.setFocus('middle')
    tree.unregister('middle')
    expect(tree.getFocusedId()).toBe('last')

    tree.unregister('last')
    expect(tree.getFocusedId()).toBe('first')
  })
})

describe('FocusTree activation', () => {
  it('activates, routes navigation into the node, and deactivates', () => {
    const tree = new FocusTree()
    const onActivate = vi.fn()
    const onNavigate = vi.fn(() => 'handled' as const)
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'above', parentId: 'root' })
    tree.register({
      id: 'composer',
      parentId: 'root',
      activatable: true,
      onActivate,
      onNavigate,
    })

    tree.setFocus('composer')
    expect(tree.getActivatedId()).toBeNull()
    expect(tree.activate()).toBe(true)
    expect(tree.getActivatedId()).toBe('composer')
    expect(onActivate).toHaveBeenCalledTimes(1)

    expect(tree.move('left')).toBe(true)
    expect(onNavigate).toHaveBeenCalledWith('left')
    expect(tree.getFocusedId()).toBe('composer')

    expect(tree.deactivate()).toBe(true)
    expect(tree.getActivatedId()).toBeNull()
  })

  it('runs the two-stage exit from an activated composer', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'above', parentId: 'root' })
    let onFirstLine = true
    tree.register({
      id: 'composer',
      parentId: 'root',
      activatable: true,
      onNavigate: (direction) => {
        if (direction === 'up' && onFirstLine) return 'exit'
        return 'handled'
      },
    })

    tree.setFocus('composer')
    tree.activate()

    // First up at the top line leaves activation, focus stays on the composer.
    expect(tree.move('up')).toBe(true)
    expect(tree.getActivatedId()).toBeNull()
    expect(tree.getFocusedId()).toBe('composer')

    // Second up navigates normally to the node above.
    onFirstLine = false
    expect(tree.move('up')).toBe(true)
    expect(tree.getFocusedId()).toBe('above')
  })

  it('calls onActivate for plain, non-activatable buttons', () => {
    const tree = new FocusTree()
    const press = vi.fn()
    tree.register({ id: 'button', parentId: null, onActivate: press })

    expect(tree.activate()).toBe(true)
    expect(press).toHaveBeenCalledTimes(1)
    expect(tree.getActivatedId()).toBeNull()
  })

  it('cancels the focused node when not activated', () => {
    const tree = new FocusTree()
    const onCancel = vi.fn()
    tree.register({ id: 'button', parentId: null, onCancel })

    expect(tree.cancel()).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('FocusTree scopes', () => {
  it('restricts navigation to the top scope and restores focus on pop', () => {
    const tree = new FocusTree()
    tree.register({ id: 'root', parentId: null, container: true, flow: 'column' })
    tree.register({ id: 'background', parentId: 'root' })
    tree.register({ id: 'modal', parentId: 'root', container: true, flow: 'column', scope: true })
    tree.register({ id: 'm1', parentId: 'modal' })
    tree.register({ id: 'm2', parentId: 'modal' })

    expect(tree.getFocusedId()).toBe('background')
    tree.pushScope('modal')
    expect(tree.getFocusedId()).toBe('m1')
    expect(tree.move('down')).toBe(true)
    expect(tree.getFocusedId()).toBe('m2')
    // Never escapes the scope.
    expect(tree.move('down')).toBe(false)
    expect(tree.getFocusedId()).toBe('m2')

    tree.popScope()
    expect(tree.getFocusedId()).toBe('background')
  })
})
