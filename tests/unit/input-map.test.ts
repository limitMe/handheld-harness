import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BINDINGS,
  detectConflicts,
  emptyBindingLayer,
  mergeActionMaps,
  presetForGamepadId,
  resolveActionMap,
  type BindingLayer,
  type DevicePreset,
} from '../../src/shared/input'

describe('action map layering', () => {
  it('merges layers in ascending precedence', () => {
    const base: BindingLayer = { contexts: { a: { A: 'nav.activate' } }, keyboard: {} }
    const override: BindingLayer = {
      contexts: { a: { A: 'input.send', B: 'nav.deactivate' } },
      keyboard: {},
    }

    const merged = mergeActionMaps([base, override])

    expect(merged.contexts.a).toEqual({ A: 'input.send', B: 'nav.deactivate' })
  })

  it('treats null as an explicit unbind', () => {
    const merged = mergeActionMaps([
      DEFAULT_BINDINGS,
      { contexts: { global: { Back: null } }, keyboard: {} },
    ])

    expect(merged.contexts.global?.Back).toBeUndefined()
    expect(merged.contexts.global?.Start).toBe('menu.toggle')
  })

  it('binds both sticks: vertical scroll and horizontal navigation', () => {
    const map = resolveActionMap(undefined, emptyBindingLayer())
    expect(map.contexts.currentWork?.LStickY).toBe('scroll')
    expect(map.contexts.currentWork?.RStickY).toBe('scroll')
    expect(map.contexts.currentWork?.['LStickX+']).toBe('nav.right')
    expect(map.contexts.currentWork?.['LStickX-']).toBe('nav.left')
    expect(map.contexts.currentWork?.['RStickX+']).toBe('nav.right')
    expect(map.contexts.currentWork?.['RStickX-']).toBe('nav.left')
  })

  it('overlays a device preset matched by gamepad id', () => {
    const preset: DevicePreset = {
      name: 'Test pad',
      match: 'Ally',
      bindings: { contexts: { taskMap: { Y: 'task.history' } }, keyboard: {} },
    }

    const map = resolveActionMap('Xbox Wireless Controller (Ally)', emptyBindingLayer(), [preset])

    expect(map.contexts.taskMap?.Y).toBe('task.history')
    expect(presetForGamepadId('ASUS ROG Ally', [preset])?.name).toBe('Test pad')
    expect(presetForGamepadId('DualSense', [preset])).toBeUndefined()
  })

  it('lets the user layer win over a device preset', () => {
    const preset: DevicePreset = {
      name: 'Test pad',
      match: 'Ally',
      bindings: { contexts: { taskMap: { Y: 'task.history' } }, keyboard: {} },
    }

    const map = resolveActionMap(
      'Ally',
      { contexts: { taskMap: { Y: 'task.new' } }, keyboard: {} },
      [preset],
    )

    expect(map.contexts.taskMap?.Y).toBe('task.new')
  })
})

describe('conflict detection', () => {
  it('accepts the default map', () => {
    expect(detectConflicts(DEFAULT_BINDINGS.contexts)).toEqual([])
  })

  it('reports the same control and press type bound to two actions', () => {
    const conflicts = detectConflicts({
      currentWork: { A: 'nav.activate', 'A:press': 'input.send' },
    })

    expect(conflicts).toEqual([
      {
        context: 'currentWork',
        control: 'A',
        phase: 'press',
        actions: ['nav.activate', 'input.send'],
      },
    ])
  })

  it('allows the same control to carry a short and a long binding', () => {
    expect(detectConflicts({ taskMap: { B: 'map.exit', 'B:hold': 'task.close' } })).toEqual([])
  })
})
