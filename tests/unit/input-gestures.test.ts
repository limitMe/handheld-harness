import { describe, expect, it } from 'vitest'
import type { ActionId } from '../../src/shared/actions'
import { GestureResolver, type BindingResolver } from '../../src/renderer/src/input/gestures'
import type { ControlChange, InputActionEvent } from '../../src/renderer/src/input/types'

interface Bindings {
  [control: string]: { short?: ActionId; hold?: ActionId }
}

function makeResolver(bindings: Bindings): GestureResolver {
  const resolve: BindingResolver = (control, phase) =>
    phase === 'hold' ? bindings[control]?.hold : bindings[control]?.short
  return new GestureResolver({ resolve })
}

function press(control: string, value = 1): ControlChange {
  return { control, pressed: true, value, source: 'gamepad' }
}

function release(control: string): ControlChange {
  return { control, pressed: false, value: 0, source: 'gamepad' }
}

function analog(control: string, value: number, valueChanged = false): ControlChange {
  return { control, pressed: true, value, source: 'gamepad', valueChanged }
}

function phases(events: InputActionEvent[]): string[] {
  return events.map((event) => `${event.action}:${event.phase}`)
}

describe('GestureResolver short and long press', () => {
  it('fires a short-only binding immediately and ends on release', () => {
    const resolver = makeResolver({ A: { short: 'input.send' } })

    expect(phases(resolver.handle(press('A'), 0))).toEqual(['input.send:start'])
    expect(phases(resolver.handle(release('A'), 50))).toEqual(['input.send:end'])
  })

  it('ignores unbound controls', () => {
    const resolver = makeResolver({})

    expect(resolver.handle(press('A'), 0)).toEqual([])
    expect(resolver.handle(release('A'), 50)).toEqual([])
  })

  it('waits for the threshold before firing a hold-only binding', () => {
    const resolver = makeResolver({ B: { hold: 'task.close' } })

    expect(resolver.handle(press('B'), 0)).toEqual([])
    expect(resolver.tick(399)).toEqual([])
    expect(phases(resolver.tick(400))).toEqual(['task.close:start'])
    expect(phases(resolver.handle(release('B'), 500))).toEqual(['task.close:end'])
  })

  it('never fires a hold-only binding released before the threshold', () => {
    const resolver = makeResolver({ B: { hold: 'task.close' } })

    resolver.handle(press('B'), 0)

    expect(resolver.handle(release('B'), 100)).toEqual([])
  })

  it('delays the short press when short and hold share a control', () => {
    const resolver = makeResolver({ B: { short: 'map.exit', hold: 'task.close' } })

    resolver.handle(press('B'), 0)

    expect(resolver.tick(399)).toEqual([])
    expect(phases(resolver.handle(release('B'), 399))).toEqual(['map.exit:start', 'map.exit:end'])
  })

  it('suppresses the short press once the hold threshold passes', () => {
    const resolver = makeResolver({ B: { short: 'map.exit', hold: 'task.close' } })

    resolver.handle(press('B'), 0)

    expect(phases(resolver.tick(400))).toEqual(['task.close:start'])
    expect(phases(resolver.handle(release('B'), 500))).toEqual(['task.close:end'])
  })

  it('decides at release when the threshold was crossed without a tick', () => {
    const resolver = makeResolver({ B: { short: 'map.exit', hold: 'task.close' } })

    resolver.handle(press('B'), 0)

    expect(phases(resolver.handle(release('B'), 400))).toEqual([
      'task.close:start',
      'task.close:end',
    ])
  })
})

describe('GestureResolver repeat', () => {
  it('repeats a held repeatable action after the delay', () => {
    const resolver = makeResolver({ DpadRight: { short: 'nav.right' } })

    expect(phases(resolver.handle(press('DpadRight'), 0))).toEqual(['nav.right:start'])
    expect(resolver.tick(349)).toEqual([])
    expect(phases(resolver.tick(350))).toEqual(['nav.right:repeat'])
    expect(resolver.tick(400)).toEqual([])
    expect(phases(resolver.tick(410))).toEqual(['nav.right:repeat'])
    expect(phases(resolver.handle(release('DpadRight'), 420))).toEqual(['nav.right:end'])
  })

  it('does not repeat non-repeatable actions', () => {
    const resolver = makeResolver({ A: { short: 'input.send' } })

    resolver.handle(press('A'), 0)

    expect(resolver.tick(1000)).toEqual([])
  })
})

describe('GestureResolver simultaneous and analog controls', () => {
  it('tracks multiple controls independently', () => {
    const resolver = makeResolver({
      A: { short: 'nav.activate' },
      DpadUp: { short: 'nav.up' },
    })

    expect(phases(resolver.handle(press('A'), 0))).toEqual(['nav.activate:start'])
    expect(phases(resolver.handle(press('DpadUp'), 0))).toEqual(['nav.up:start'])
    expect(phases(resolver.handle(release('A'), 10))).toEqual(['nav.activate:end'])
    expect(phases(resolver.handle(release('DpadUp'), 20))).toEqual(['nav.up:end'])
  })

  it('emits start, value updates and end for a stick', () => {
    const resolver = makeResolver({ RStickY: { short: 'scroll' } })

    expect(phases(resolver.handle(analog('RStickY', 0.8), 0))).toEqual(['scroll:start'])
    expect(phases(resolver.handle(analog('RStickY', 0.3, true), 10))).toEqual(['scroll:repeat'])
    expect(phases(resolver.handle(release('RStickY'), 20))).toEqual(['scroll:end'])
  })

  it('resolves a stick direction before the bare control', () => {
    const resolver = makeResolver({
      'LStickX+': { short: 'nav.right' },
      'LStickX-': { short: 'nav.left' },
      LStickX: { short: 'scroll' },
    })

    expect(phases(resolver.handle(analog('LStickX', 0.7), 0))).toEqual(['nav.right:start'])
    expect(phases(resolver.handle(release('LStickX'), 10))).toEqual(['nav.right:end'])
    expect(phases(resolver.handle(analog('LStickX', -0.7), 20))).toEqual(['nav.left:start'])
  })

  it('releases every held control on reset', () => {
    const resolver = makeResolver({ A: { short: 'nav.activate' }, B: { short: 'nav.deactivate' } })

    resolver.handle(press('A'), 0)
    resolver.handle(press('B'), 0)

    expect(phases(resolver.reset()).sort()).toEqual(['nav.activate:end', 'nav.deactivate:end'])
  })
})
