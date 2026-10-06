import { describe, expect, it, vi } from 'vitest'
import { emptyBindingLayer, resolveActionMap } from '../../src/shared/input'
import { InputRouter, type DispatchRecord } from '../../src/renderer/src/input/router'
import type { InputActionEvent } from '../../src/renderer/src/input/types'

const MAP = resolveActionMap(undefined, emptyBindingLayer())

function event(action: InputActionEvent['action']): InputActionEvent {
  return { action, phase: 'start', source: 'gamepad', control: 'A' }
}

describe('InputRouter binding resolution', () => {
  it('resolves bindings from the context stack', () => {
    const router = new InputRouter(MAP)

    expect(router.contextIds()).toEqual(['global'])
    expect(router.resolveGamepad('A', 'press')).toBeUndefined()

    const pop = router.pushContext('currentWork', () => ({}))
    expect(router.resolveGamepad('A', 'press')).toBe('nav.activate')
    expect(router.resolveGamepad('A', 'hold')).toBeUndefined()

    pop()
    expect(router.resolveGamepad('A', 'press')).toBeUndefined()
  })

  it('resolves short and long bindings independently on the task map', () => {
    const router = new InputRouter(MAP)
    router.pushContext('taskMap', () => ({}))

    expect(router.resolveGamepad('B', 'press')).toBe('map.exit')
    expect(router.resolveGamepad('B', 'hold')).toBe('task.close')
  })

  it('only intercepts global keyboard combos while a text field is active', () => {
    const router = new InputRouter(MAP)
    router.pushContext('currentWork', () => ({}))

    expect(router.resolveKeyboard('ArrowUp', false)).toBe('nav.up')
    expect(router.resolveKeyboard('ArrowUp', true)).toBeUndefined()
  })
})

describe('InputRouter dispatch', () => {
  it('dispatches to the top context first and stops there', () => {
    const router = new InputRouter(MAP)
    const calls: string[] = []
    router.pushContext('global', () => ({ 'menu.toggle': () => calls.push('global') }))
    router.pushContext('currentWork', () => ({ 'menu.toggle': () => calls.push('currentWork') }))

    expect(router.dispatch(event('menu.toggle'))).toBe(true)
    expect(calls).toEqual(['currentWork'])
  })

  it('falls through to a lower context when the top does not handle it', () => {
    const router = new InputRouter(MAP)
    const handler = vi.fn()
    router.pushContext('global', () => ({ 'menu.toggle': handler }))
    router.pushContext('currentWork', () => ({}))

    expect(router.dispatch(event('menu.toggle'))).toBe(true)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('reports unhandled actions to subscribers', () => {
    const router = new InputRouter(MAP)
    const records: DispatchRecord[] = []
    const off = router.subscribe((record) => records.push(record))

    expect(router.dispatch(event('input.send'))).toBe(false)
    expect(records).toEqual([{ event: event('input.send'), handled: false }])
    off()
  })

  it('notifies context subscribers as the stack changes', () => {
    const router = new InputRouter(MAP)
    const seen: string[][] = []
    const off = router.subscribeContexts((ids) => seen.push(ids))

    const pop = router.pushContext('currentWork', () => ({}))
    pop()
    off()

    expect(seen).toEqual([['global'], ['currentWork', 'global'], ['global']])
  })
})
