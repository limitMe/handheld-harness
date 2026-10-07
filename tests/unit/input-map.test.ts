import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BINDINGS,
  detectConflicts,
  emptyBindingLayer,
  isLockedBinding,
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

  it('routes D-pad and both sticks for dialogs and list popups', () => {
    const map = resolveActionMap(undefined, emptyBindingLayer())
    expect(map.contexts.dialog?.DpadLeft).toBe('nav.left')
    expect(map.contexts.dialog?.['LStickY+']).toBe('nav.down')
    expect(map.contexts.dialog?.['RStickX-']).toBe('nav.left')
    expect(map.contexts.dialog?.A).toBe('nav.activate')
    expect(map.contexts['currentWork.listInput']?.['LStickY-']).toBe('nav.up')
    expect(map.contexts['taskMap.history']?.DpadUp).toBe('nav.up')
    expect(map.contexts['taskMap.history']?.['LStickY+']).toBe('nav.down')
  })

  it('binds X in the activated input to backspace', () => {
    const map = resolveActionMap(undefined, emptyBindingLayer())
    expect(map.contexts['currentWork.input']?.X).toBe('input.deleteBackward')
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

  it('restores locked system shortcuts from a corrupted user layer', () => {
    const map = resolveActionMap(undefined, {
      contexts: {
        global: { Start: null, Back: 'nav.up', 'RStickY+': 'menu.toggle', X: 'map.toggle' },
      },
      keyboard: {},
    })

    expect(map.contexts.global?.Start).toBe('menu.toggle')
    expect(map.contexts.global?.Back).toBe('map.toggle')
    expect(map.contexts.global?.['RStickY+']).toBeUndefined()
    expect(map.contexts.global?.X).toBeUndefined()
  })

  it('knows which bindings are locked', () => {
    expect(isLockedBinding('global', 'menu.toggle')).toBe(true)
    expect(isLockedBinding('global', 'map.toggle')).toBe(true)
    expect(isLockedBinding('global', 'voice.dictate')).toBe(false)
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
