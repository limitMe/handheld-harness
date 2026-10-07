import { describe, expect, it } from 'vitest'
import type { ActionId } from '../../src/shared/actions'
import { resolveActionMap, emptyBindingLayer } from '../../src/shared/input'
import {
  bindingTable,
  contextLabel,
  findKeyForAction,
  formatBindingKey,
  listBindings,
  listContexts,
  rebindConflict,
  rebindRows,
} from '../../src/shared/bindings'

const map = resolveActionMap(undefined, emptyBindingLayer())

describe('binding helpers', () => {
  it('maps friendly names and falls back to the context id', () => {
    expect(contextLabel('currentWork.input')).toBe('Current work · Input')
    expect(contextLabel('something.unknown')).toBe('something.unknown')
  })

  it('lists contexts in display order, skipping empty ones', () => {
    const contexts = listContexts(map, 'gamepad')
    expect(contexts[0]).toBe('global')
    expect(contexts).toContain('currentWork.input')
    expect(contexts.indexOf('systemMenu')).toBeGreaterThan(contexts.indexOf('taskMap'))
    expect(listContexts(map, 'keyboard')).not.toContain('global')
  })

  it('lists bindings sorted by the canonical action order', () => {
    const rows = listBindings(map, 'gamepad', 'currentWork.input')
    expect(rows.map((row) => row.action)).toEqual([
      'input.send',
      'input.deactivate',
      'input.listInput',
      'input.textEdit',
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

  it('formats hold and keyboard keys', () => {
    expect(formatBindingKey('B:hold', 'gamepad')).toBe('B (hold)')
    expect(formatBindingKey('B', 'gamepad')).toBe('B')
    expect(formatBindingKey('Ctrl+K', 'keyboard')).toBe('Ctrl+K')
  })
})
