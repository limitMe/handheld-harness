import { describe, expect, it } from 'vitest'
import { buildHintEntries, hintContextIds } from '../../src/renderer/src/hints/entries'
import { DEFAULT_BINDINGS, mergeActionMaps, type BindingLayer } from '../../src/shared/input'

const stack = ['currentWork.input', 'currentWork', 'global']

describe('hintContextIds', () => {
  it('keeps the activated context plus the global layer', () => {
    expect(hintContextIds(stack)).toEqual(['currentWork.input', 'global'])
  })

  it('falls back to global when nothing is activated', () => {
    expect(hintContextIds(['global'])).toEqual(['global'])
    expect(hintContextIds([])).toEqual(['global'])
  })
})

describe('buildHintEntries', () => {
  it('reverses the activated context and global bindings into hints', () => {
    const map = mergeActionMaps([DEFAULT_BINDINGS])
    const entries = buildHintEntries(map, stack, { editable: true })

    expect(entries.map((entry) => entry.action)).toEqual([
      'input.send',
      'input.deactivate',
      'input.deleteBackward',
      'input.listInput',
      'input.textEdit',
      'voice.dictate',
    ])
    expect(entries[0]).toEqual({ action: 'input.send', control: 'A', phase: 'press' })
    expect(entries[2]).toEqual({ action: 'input.deleteBackward', control: 'X', phase: 'press' })
    expect(entries[5]).toEqual({ action: 'voice.dictate', control: 'Y', phase: 'hold' })
  })

  it('hides navigation and global chrome', () => {
    const map = mergeActionMaps([DEFAULT_BINDINGS])
    const actions = buildHintEntries(map, stack, { editable: true }).map((entry) => entry.action)
    expect(actions).not.toContain('nav.up')
    expect(actions).not.toContain('menu.toggle')
    expect(actions).not.toContain('map.toggle')
  })

  it('hides dictation unless the activated element is a text field', () => {
    const map = mergeActionMaps([DEFAULT_BINDINGS])
    const actions = buildHintEntries(map, stack, { editable: false }).map((entry) => entry.action)
    expect(actions).not.toContain('voice.dictate')
  })

  it('offers dictation from a screen that binds it, even without a native field', () => {
    const map = mergeActionMaps([DEFAULT_BINDINGS])
    const entries = buildHintEntries(map, ['textEdit', 'global'], { editable: false })
    const byAction = new Map(entries.map((entry) => [entry.action, entry.control]))
    // The text editor owns a text cursor even though its focus node is a div.
    expect(byAction.get('voice.dictate')).toBe('Y')
    expect(byAction.get('input.deleteBackward')).toBe('X')
  })

  it('reflects a rebinding in the shown control', () => {
    const user: BindingLayer = {
      contexts: {
        'currentWork.input': { A: 'input.textEdit', RB: 'input.send' },
      },
      keyboard: {},
    }
    const map = mergeActionMaps([DEFAULT_BINDINGS, user])
    const entries = buildHintEntries(map, stack, { editable: true })
    const byAction = new Map(entries.map((entry) => [entry.action, entry.control]))

    expect(byAction.get('input.textEdit')).toBe('A')
    expect(byAction.get('input.send')).toBe('RB')
  })
})
