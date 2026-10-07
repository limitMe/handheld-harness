import { describe, expect, it } from 'vitest'
import type { ActionId } from '../../src/shared/actions'
import { resolveActionMap, emptyBindingLayer } from '../../src/shared/input'
import {
  bindingTable,
  contextLabel,
  contextsForAction,
  findKeyForAction,
  formatBindingKey,
  HIDDEN_BINDING_ACTIONS,
  listBindings,
  listContexts,
  rebindConflict,
  rebindRows,
  sharedBindings,
  sharedConflict,
  sharedRebindRows,
} from '../../src/shared/bindings'

const map = resolveActionMap(undefined, emptyBindingLayer())

describe('binding helpers', () => {
  it('maps friendly names and falls back to the context id', () => {
    expect(contextLabel('currentWork.input')).toBe('Current work · Input')
    expect(contextLabel('something.unknown')).toBe('something.unknown')
  })

  it('lists contexts in display order, skipping empty and hidden ones', () => {
    const contexts = listContexts(map, 'gamepad')
    expect(contexts[0]).toBe('global')
    expect(contexts).toContain('currentWork.input')
    // The system menu is fixed, so it never shows up in settings.
    expect(contexts).not.toContain('systemMenu')
    expect(contexts).not.toContain('systemMenu.picker')

    // Keyboard has a global layer too: Ctrl+D toggles dictation (spec 16).
    const keyboardContexts = listContexts(map, 'keyboard')
    expect(keyboardContexts[0]).toBe('global')
    expect(keyboardContexts).toContain('currentWork')
    // Esc / Tab live in their own keyboard chrome group above the screens.
    expect(keyboardContexts).toContain('global.chrome')
  })

  it('lists bindings sorted by the canonical action order', () => {
    const rows = listBindings(map, 'gamepad', 'currentWork.input')
    expect(rows.map((row) => row.action)).toEqual([
      'input.send',
      'input.deactivate',
      'input.listInput',
      'input.textEdit',
      'input.deleteBackward',
    ])
    expect(rows[0]).toMatchObject({ action: 'input.send', key: 'A' })
  })

  it('finds the key bound to an action', () => {
    const table = bindingTable(map, 'gamepad')['currentWork.input']
    expect(findKeyForAction(table, 'input.send')).toBe('A')
    expect(findKeyForAction(table, 'task.open')).toBeUndefined()
  })

  it('detects a conflict on the new key only', () => {
    const table = bindingTable(map, 'gamepad')['currentWork.input']
    expect(rebindConflict(table, 'input.send', 'A')).toBeNull()
    expect(rebindConflict(table, 'input.send', 'B')).toBe('input.deactivate')
  })

  it('unbinds the old key when there is no conflict', () => {
    const rows = rebindRows({ A: 'input.send' }, 'input.send', 'A', 'X')
    expect(rows).toEqual({ X: 'input.send', A: null })
  })

  it('overwrites the conflicting action by leaving its key taken', () => {
    const table: Record<string, ActionId> = { A: 'input.send', X: 'input.deactivate' }
    const rows = rebindRows(table, 'input.send', 'A', 'X', 'overwrite')
    expect(rows).toEqual({ X: 'input.send', A: null })
  })

  it('swaps the old key to the conflicting action', () => {
    const table: Record<string, ActionId> = { A: 'input.send', X: 'input.deactivate' }
    const rows = rebindRows(table, 'input.send', 'A', 'X', 'swap')
    expect(rows).toEqual({ X: 'input.send', A: 'input.deactivate' })
  })

  it('does nothing when the key is unchanged', () => {
    expect(rebindRows({ A: 'input.send' }, 'input.send', 'A', 'A')).toEqual({
      A: 'input.send',
    })
  })

  it('formats hold, keyboard and stick-direction keys', () => {
    expect(formatBindingKey('B:hold', 'gamepad')).toBe('B (hold)')
    expect(formatBindingKey('B', 'gamepad')).toBe('B')
    expect(formatBindingKey('LStickX+', 'gamepad')).toBe('LStickX →')
    expect(formatBindingKey('LStickX-', 'gamepad')).toBe('LStickX ←')
    expect(formatBindingKey('Ctrl+K', 'keyboard')).toBe('Ctrl+K')
  })

  it('marks select / back / scroll as hidden from the per-context lists', () => {
    for (const action of ['nav.activate', 'nav.deactivate', 'scroll'] as const) {
      expect(HIDDEN_BINDING_ACTIONS.has(action)).toBe(true)
    }
    // currentWork keeps only its own actions once the hidden ones are dropped.
    const visible = listBindings(map, 'gamepad', 'currentWork')
      .map((row) => row.action)
      .filter((action) => !HIDDEN_BINDING_ACTIONS.has(action))
    expect(visible).toEqual(['agent.abort'])
  })

  it('describes select / back as one shared binding', () => {
    const shared = sharedBindings(map, 'gamepad')
    const activate = shared.find((binding) => binding.action === 'nav.activate')
    const deactivate = shared.find((binding) => binding.action === 'nav.deactivate')
    expect(activate?.key).toBe('A')
    expect(deactivate?.key).toBe('B')
    for (const context of ['currentWork', 'dialog', 'systemMenu']) {
      expect(activate?.contexts).toContain(context)
    }
    expect(contextsForAction(map, 'keyboard', 'nav.activate')).toContain('dialog')
  })

  it('fans a shared rebind out to every context', () => {
    const rows = sharedRebindRows(map, 'gamepad', 'nav.activate', 'A', 'LB:hold')
    expect(Object.keys(rows).length).toBeGreaterThan(1)
    for (const contextRows of Object.values(rows)) {
      expect(contextRows).toEqual({ 'LB:hold': 'nav.activate', A: null })
    }
  })

  it('reports a shared conflict from any context', () => {
    expect(sharedConflict(map, 'gamepad', 'nav.activate', 'B')).toBe('nav.deactivate')
    expect(sharedConflict(map, 'gamepad', 'nav.activate', 'LB:hold')).toBe('agent.abort')
    expect(sharedConflict(map, 'gamepad', 'nav.activate', 'Z')).toBeNull()
  })
})
